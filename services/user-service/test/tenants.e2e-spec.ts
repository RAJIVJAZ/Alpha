import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import type { TenantRole } from '@foodgrid/types';
import { InternalHttpService } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { SERVICE } from '../src/service.config';

const GSTIN = '29AABCS1234K1ZC';
const OTHER_GSTIN = '29AAJCS3456P1ZI';

describe('user-service tenants & profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());
  let tenantId: string;

  /** A user who is a member of the test tenant, with an access token carrying that membership. */
  const staff = async (phone: string, role: TenantRole, outletIds: string[] = []) => {
    const user = await prisma.user.create({ data: { phone, name: `${role} ${phone}` } });
    const member = await prisma.tenantMember.create({
      data: { tenantId, userId: user.id, role, outletIds },
    });
    const token = issueTestToken({
      sub: user.id,
      roles: ['CUSTOMER'],
      tenantId,
      tenantType: 'RESTAURANT',
      tenantRole: role,
      outletIds,
    });
    return { user, member, auth: `Bearer ${token}` };
  };

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['identity', 'platform']);
    http.reset();
    http.on('POST', 'auth', 'internal/auth/revoke-user-sessions', { revoked: 1 });
    http.on('POST', 'notification', 'internal/notifications/send', { id: 'n1' });
    const tenant = await prisma.tenant.create({
      data: {
        type: 'RESTAURANT',
        status: 'ACTIVE',
        name: 'Test Kitchen',
        slug: 'test-kitchen',
        legalName: 'Test Kitchen Pvt Ltd',
        gstin: GSTIN,
        pan: 'AABCS1234K',
        kycDocuments: [{ kind: 'PAN', url: 's3://kyc/pan.pdf' }],
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('staff management', () => {
    it('stops a manager from making themselves owner, inviting owners or removing the owner', async () => {
      const owner = await staff('+919811100001', 'OWNER');
      const manager = await staff('+919811100002', 'MANAGER', ['outlet-1']);

      const self = await api()
        .patch(`/api/v1/tenants/current/members/${manager.member.id}`)
        .set('Authorization', manager.auth)
        .send({ role: 'OWNER', outletIds: [] })
        .expect(403);
      expect(self.body.code).toBe('SELF_UPDATE');
      const revokeOwner = await api()
        .patch(`/api/v1/tenants/current/members/${owner.member.id}`)
        .set('Authorization', manager.auth)
        .send({ status: 'REVOKED' })
        .expect(403);
      expect(revokeOwner.body.code).toBe('ROLE_NOT_ALLOWED');
      const inviteOwner = await api()
        .post('/api/v1/tenants/current/members')
        .set('Authorization', manager.auth)
        .send({ phone: '+919811100003', role: 'OWNER', outletIds: ['outlet-1'] })
        .expect(403);
      expect(inviteOwner.body.code).toBe('ROLE_NOT_ALLOWED');
      const wider = await api()
        .post('/api/v1/tenants/current/members')
        .set('Authorization', manager.auth)
        .send({ phone: '+919811100003', role: 'CHEF' })
        .expect(403);
      expect(wider.body.code).toBe('OUTLET_NOT_ALLOWED');

      expect(
        await prisma.tenantMember.findMany({
          where: { tenantId },
          select: { role: true, status: true, outletIds: true },
          orderBy: { createdAt: 'asc' },
        }),
      ).toEqual([
        { role: 'OWNER', status: 'ACTIVE', outletIds: [] },
        { role: 'MANAGER', status: 'ACTIVE', outletIds: ['outlet-1'] },
      ]);

      // the owner still can, and the promoted member's old tokens are ended
      await api()
        .patch(`/api/v1/tenants/current/members/${manager.member.id}`)
        .set('Authorization', owner.auth)
        .send({ role: 'OWNER', outletIds: [] })
        .expect(200);
      expect(http.callsTo('auth', 'internal/auth/revoke-user-sessions')).toEqual([
        expect.objectContaining({ body: { userId: manager.user.id } }),
      ]);
    });

    it('ends a revoked owner’s access and stops them re-inviting themselves', async () => {
      const founder = await staff('+919811100011', 'OWNER');
      const coOwner = await staff('+919811100012', 'OWNER');
      await api()
        .patch(`/api/v1/tenants/current/members/${founder.member.id}`)
        .set('Authorization', coOwner.auth)
        .send({ status: 'REVOKED' })
        .expect(200);
      expect(http.callsTo('auth', 'internal/auth/revoke-user-sessions')).toEqual([
        expect.objectContaining({ body: { userId: founder.user.id } }),
      ]);

      // the founder's token from before the revocation (still unexpired)
      for (const phone of ['+919811100011', '+919811100013']) {
        const res = await api()
          .post('/api/v1/tenants/current/members')
          .set('Authorization', founder.auth)
          .send({ phone, role: 'OWNER' })
          .expect(403);
        expect(res.body.code).toBe('NOT_A_MEMBER');
      }
      await api()
        .get('/api/v1/tenants/current/members')
        .set('Authorization', founder.auth)
        .expect(403);
      expect(
        (await prisma.tenantMember.findUniqueOrThrow({ where: { id: founder.member.id } })).status,
      ).toBe('REVOKED');
    });

    it('does not enrol or reveal anyone until they accept the invite', async () => {
      const owner = await staff('+919811100021', 'OWNER');
      const victim = await prisma.user.create({
        data: {
          phone: '+919811100022',
          name: 'Victim Verifier',
          email: 'victim@example.com',
          lastLoginAt: new Date(),
        },
      });
      const invited = await api()
        .post('/api/v1/tenants/current/members')
        .set('Authorization', owner.auth)
        .send({ phone: '+919811100022', role: 'STAFF' })
        .expect(201);
      expect(invited.body.status).toBe('INVITED');

      const listed = await api()
        .get('/api/v1/tenants/current/members')
        .set('Authorization', owner.auth)
        .expect(200);
      const row = listed.body.find((m: { id: string }) => m.id === invited.body.id);
      expect(row.user).toEqual({
        id: victim.id,
        phone: '+919811100022',
        name: null,
        email: null,
        avatarUrl: null,
        lastLoginAt: null,
      });

      // the invitee is not a member until they accept
      const victimAuth = `Bearer ${issueTestToken({ sub: victim.id, roles: ['CUSTOMER'] })}`;
      expect(
        (await api().get('/api/v1/tenants/mine').set('Authorization', victimAuth).expect(200)).body,
      ).toEqual([]);
      const invites = await api()
        .get('/api/v1/tenants/invites')
        .set('Authorization', victimAuth)
        .expect(200);
      expect(invites.body).toEqual([
        expect.objectContaining({
          id: invited.body.id,
          tenant: expect.objectContaining({ id: tenantId }),
        }),
      ]);
      // nobody else can accept it
      await api()
        .post(`/api/v1/tenants/invites/${invited.body.id}/accept`)
        .set('Authorization', owner.auth)
        .expect(404);
      await api()
        .post(`/api/v1/tenants/invites/${invited.body.id}/accept`)
        .set('Authorization', victimAuth)
        .expect(201);
      const after = await api()
        .get('/api/v1/tenants/current/members')
        .set('Authorization', owner.auth)
        .expect(200);
      expect(after.body.find((m: { id: string }) => m.id === invited.body.id).user.name).toBe(
        'Victim Verifier',
      );

      // inviting an unregistered phone does not let the inviter name that account
      await api()
        .post('/api/v1/tenants/current/members')
        .set('Authorization', owner.auth)
        .send({ phone: '+919811100023', role: 'STAFF', name: 'Attacker Chosen Name' })
        .expect(201);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { phone: '+919811100023' } })).name,
      ).toBeNull();
    });
  });

  describe('tenant details', () => {
    it('keeps verified KYC identifiers until a reviewer approves the change', async () => {
      const owner = await staff('+919811100031', 'OWNER');
      const swap = await api()
        .patch('/api/v1/tenants/current')
        .set('Authorization', owner.auth)
        .send({ gstin: OTHER_GSTIN, legalName: 'Spice Garden Hospitality Pvt Ltd' })
        .expect(400);
      expect(swap.body.code).toBe('VALIDATION_FAILED');
      await api()
        .patch('/api/v1/tenants/current')
        .set('Authorization', owner.auth)
        .send({ name: 'Renamed Kitchen' })
        .expect(200);

      await api()
        .post('/api/v1/tenants/current/kyc')
        .set('Authorization', owner.auth)
        .send({
          documents: [{ kind: 'GST', url: 'https://kyc.example/gst.pdf' }],
          gstin: OTHER_GSTIN,
          legalName: 'New Legal Name Pvt Ltd',
        })
        .expect(201);
      let tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      expect(tenant).toMatchObject({ status: 'ACTIVE', gstin: GSTIN, name: 'Renamed Kitchen' });

      const ops = `Bearer ${issueTestToken({ sub: 'ops_1', roles: ['OPS'] })}`;
      const approval = await prisma.approvalRequest.findFirstOrThrow({ where: { tenantId } });
      await api()
        .post(`/api/v1/admin/approvals/${approval.id}/decision`)
        .set('Authorization', ops)
        .send({ decision: 'REJECTED', notes: 'GSTIN belongs to another business' })
        .expect(201);
      tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      expect(tenant).toMatchObject({ status: 'ACTIVE', gstin: GSTIN });

      await api()
        .post('/api/v1/tenants/current/kyc')
        .set('Authorization', owner.auth)
        .send({ documents: [], gstin: OTHER_GSTIN, legalName: 'New Legal Name Pvt Ltd' })
        .expect(201);
      const second = await prisma.approvalRequest.findFirstOrThrow({
        where: { tenantId, status: 'PENDING' },
      });
      await api()
        .post(`/api/v1/admin/approvals/${second.id}/decision`)
        .set('Authorization', ops)
        .send({ decision: 'APPROVED' })
        .expect(201);
      tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      expect(tenant).toMatchObject({
        status: 'ACTIVE',
        gstin: OTHER_GSTIN,
        stateCode: '29',
        legalName: 'New Legal Name Pvt Ltd',
      });
    });

    it('shows PAN and KYC documents only to settings or finance roles', async () => {
      const chef = await staff('+919811100041', 'CHEF');
      const accountant = await staff('+919811100042', 'ACCOUNTANT');
      const res = await api()
        .get('/api/v1/tenants/current')
        .set('Authorization', chef.auth)
        .expect(200);
      expect(res.body).toMatchObject({ id: tenantId, name: 'Test Kitchen', gstin: GSTIN });
      for (const field of ['pan', 'kycDocuments', 'approvedBy', 'rejectionReason'])
        expect(res.body).not.toHaveProperty(field);
      const mine = await api()
        .get('/api/v1/tenants/mine')
        .set('Authorization', chef.auth)
        .expect(200);
      expect(mine.body[0].tenant).not.toHaveProperty('pan');
      expect(mine.body[0].tenant).not.toHaveProperty('kycDocuments');

      const full = await api()
        .get('/api/v1/tenants/current')
        .set('Authorization', accountant.auth)
        .expect(200);
      expect(full.body).toMatchObject({ pan: 'AABCS1234K' });
    });
  });

  describe('profile email', () => {
    it('stores a new email only after the code sent to it is confirmed', async () => {
      const user = await prisma.user.create({ data: { phone: '+919811100051' } });
      const auth = `Bearer ${issueTestToken({ sub: user.id, roles: ['CUSTOMER'] })}`;
      const res = await api()
        .patch('/api/v1/users/me')
        .set('Authorization', auth)
        .send({ name: 'Asha', email: 'Victim@Gmail.com' })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'Asha',
        email: null,
        emailVerification: { pendingEmail: 'victim@gmail.com' },
      });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        email: null,
        emailVerifiedAt: null,
      });
      expect(http.callsTo('notification', 'internal/notifications/send')).toEqual([
        expect.objectContaining({
          body: expect.objectContaining({ channel: 'EMAIL', recipient: 'victim@gmail.com' }),
        }),
      ]);

      const code: string = res.body.emailVerification.devCode;
      const wrong = code === '000000' ? '111111' : '000000';
      const bad = await api()
        .post('/api/v1/users/me/email/verify')
        .set('Authorization', auth)
        .send({ code: wrong })
        .expect(400);
      expect(bad.body.code).toBe('EMAIL_CODE_INVALID');
      const ok = await api()
        .post('/api/v1/users/me/email/verify')
        .set('Authorization', auth)
        .send({ code })
        .expect(200);
      expect(ok.body.email).toBe('victim@gmail.com');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt,
      ).not.toBeNull();
    });
  });
});
