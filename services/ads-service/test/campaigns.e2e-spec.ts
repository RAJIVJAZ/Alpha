import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import { EventTypes } from '@foodgrid/types';
import { notFound } from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueServiceToken,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { AdsEventHandlers } from '../src/events/ads-event.handlers';
import { SERVICE } from '../src/service.config';

const TENANT = 'tnt_spice';
const OTHER = 'tnt_pizza';
const OUTLETS: Record<string, string> = { outlet_own: TENANT, outlet_pizza: OTHER };
const PRODUCTS: Record<string, string> = { prod_pizza: OTHER };
const CITY = 'Testville';
const owner = issueTestToken({
  sub: 'owner_spice',
  roles: ['CUSTOMER'],
  tenantId: TENANT,
  tenantType: 'RESTAURANT',
  tenantRole: 'OWNER',
});

describe('ads-service campaigns and click charging (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  const draft = {
    name: 'Biryani boost',
    placement: 'SEARCH_TOP',
    targetType: 'OUTLET',
    targetId: 'outlet_own',
    bidAmount: 10,
    dailyBudget: 50,
    totalBudget: 100,
    keywords: ['biryani'],
    cities: [CITY],
    startsAt: new Date(Date.now() - 3_600_000).toISOString(),
    creative: { title: 'Reviewed creative' },
  };

  const activeCampaign = (over: Record<string, unknown> = {}) =>
    prisma.adCampaign.create({
      data: { ...draft, tenantId: TENANT, status: 'ACTIVE', ...over } as never,
    });
  const serve = () =>
    api()
      .post('/api/v1/internal/ads/serve')
      .set('x-service-token', issueServiceToken('order-service'))
      .send({ placement: 'SEARCH_TOP', city: CITY, limit: 3 })
      .expect(200);
  const click = (body: Record<string, unknown>) =>
    api().post('/api/v1/ads/events/click').send(body).expect(200);

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['ads']);
    http.reset();
    http
      .on('GET', 'order', 'internal/outlets/:id', ({ params }) => {
        if (!OUTLETS[params.id!]) throw notFound('Outlet', params.id);
        return { id: params.id, tenantId: OUTLETS[params.id!] };
      })
      .on('GET', 'supplier', 'internal/marketplace/products/:id', ({ params }) => {
        if (!PRODUCTS[params.id!]) throw notFound('Product', params.id);
        return { id: params.id, tenantId: PRODUCTS[params.id!] };
      })
      .on('POST', 'user', 'internal/approvals', { id: 'appr_1' });
  });

  afterAll(async () => {
    await truncateSchemas(prisma, ['ads']);
    await app.close();
  });

  describe('click charging', () => {
    it('never charges anonymous clicks that carry no click token', async () => {
      const c = await activeCampaign();
      for (let i = 0; i < 6; i++) {
        const res = await click({ campaignId: c.id });
        expect(res.body).toEqual({ charged: false, reason: 'unverified' });
      }
      await click({ campaignId: c.id, sessionId: 'rotating-1' });
      await click({ campaignId: c.id, clickToken: `x.${Date.now() + 60_000}.forged` });
      const after = await prisma.adCampaign.findUniqueOrThrow({ where: { id: c.id } });
      expect(Number(after.spent)).toBe(0);
      expect(await prisma.adEvent.count({ where: { type: 'CLICK' } })).toBe(0);
    });

    it('charges one click per served impression, once, for that campaign only', async () => {
      const c = await activeCampaign();
      const other = await activeCampaign({ cities: ['Elsewhere'] });
      const served = await serve();
      expect(served.body).toHaveLength(1);
      const { clickToken } = served.body[0];
      expect(clickToken).toEqual(expect.any(String));

      // the token does not transfer to another campaign
      expect((await click({ campaignId: other.id, clickToken })).body.charged).toBe(false);

      // concurrent replays of one impression charge exactly once
      const results = await Promise.all(
        Array.from({ length: 5 }, () => click({ campaignId: c.id, clickToken })),
      );
      expect(results.filter((r) => r.body.charged)).toHaveLength(1);
      expect((await click({ campaignId: c.id, clickToken })).body).toEqual({
        charged: false,
        reason: 'duplicate',
      });

      const after = await prisma.adCampaign.findUniqueOrThrow({ where: { id: c.id } });
      expect(Number(after.spent)).toBe(10);
      const stats = await api().get(`/api/v1/ads/campaigns/${c.id}/stats`).set(as(owner));
      expect(stats.body.totals).toMatchObject({ impressions: 1, clicks: 1, spend: 10 });
    });
  });

  describe('review', () => {
    const approve = (entityId: string) =>
      app.get(AdsEventHandlers).onApproval({
        type: EventTypes.ApprovalDecided,
        data: { entityType: 'AD_CAMPAIGN', entityId, decision: 'APPROVED', reviewedBy: 'admin_1' },
      } as never);

    const approvedAndPaused = async () => {
      const created = await api().post('/api/v1/ads/campaigns').set(as(owner)).send(draft);
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      await api().post(`/api/v1/ads/campaigns/${id}/submit`).set(as(owner)).expect(200);
      await approve(id);
      const paused = await api().post(`/api/v1/ads/campaigns/${id}/pause`).set(as(owner));
      expect(paused.body).toMatchObject({ status: 'PAUSED', reviewedBy: 'admin_1' });
      return id;
    };

    it('sends an approved campaign back to draft when its reviewed content changes', async () => {
      const id = await approvedAndPaused();
      const edited = await api()
        .patch(`/api/v1/ads/campaigns/${id}`)
        .set(as(owner))
        .send({
          creative: { title: 'UNREVIEWED creative', imageUrl: 'https://example.invalid/x.png' },
          totalBudget: 100_000,
        })
        .expect(200);
      expect(edited.body).toMatchObject({ status: 'DRAFT', reviewedBy: null });
      const resumed = await api().post(`/api/v1/ads/campaigns/${id}/resume`).set(as(owner));
      expect(resumed.status).toBe(409);

      // resubmitting creates a new review with the new content
      await api().post(`/api/v1/ads/campaigns/${id}/submit`).set(as(owner)).expect(200);
      const approvals = http.callsTo('user', 'internal/approvals');
      expect(approvals).toHaveLength(2);
      expect(approvals[1]!.body).toMatchObject({
        metadata: { creative: { title: 'UNREVIEWED creative' } },
      });
    });

    it('keeps harmless edits (rename, lower bid, unchanged keywords) without a new review', async () => {
      const id = await approvedAndPaused();
      const edited = await api()
        .patch(`/api/v1/ads/campaigns/${id}`)
        .set(as(owner))
        .send({ name: 'Renamed', bidAmount: 5, keywords: ['biryani'] })
        .expect(200);
      expect(edited.body.status).toBe('PAUSED');
      const resumed = await api().post(`/api/v1/ads/campaigns/${id}/resume`).set(as(owner));
      expect(resumed.status).toBe(200);
      expect(resumed.body.status).toBe('ACTIVE');
    });
  });

  describe('target ownership', () => {
    it("refuses to sponsor another tenant's outlet or product, or a missing one", async () => {
      for (const target of [
        { targetType: 'OUTLET', targetId: 'outlet_pizza' },
        { targetType: 'OUTLET', targetId: 'outlet_missing' },
        { targetType: 'PRODUCT', targetId: 'prod_pizza' },
        { targetType: 'OUTLET', targetId: '../orders/x' },
      ]) {
        const res = await api()
          .post('/api/v1/ads/campaigns')
          .set(as(owner))
          .send({ ...draft, ...target });
        expect(res.status).toBe(404);
      }
      expect(await prisma.adCampaign.count()).toBe(0);
    });

    it("refuses to retarget an own campaign at another tenant's outlet", async () => {
      const created = await api().post('/api/v1/ads/campaigns').set(as(owner)).send(draft);
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      for (const patch of [{ targetId: 'outlet_pizza' }, { targetType: 'PRODUCT' }]) {
        const res = await api().patch(`/api/v1/ads/campaigns/${id}`).set(as(owner)).send(patch);
        expect(res.status).toBe(404);
      }
      const after = await prisma.adCampaign.findUniqueOrThrow({ where: { id } });
      expect(after).toMatchObject({ targetType: 'OUTLET', targetId: 'outlet_own' });
    });
  });
});
