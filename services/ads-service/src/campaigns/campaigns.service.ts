import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { CampaignStatus, Prisma } from '@foodgrid/database';
import type { AccessTokenClaims } from '@foodgrid/types';
import {
  badRequest,
  conflict,
  dateOnly,
  enumLabel,
  istDate,
  notFound,
  round2,
} from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import { CampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
  ) {}

  private validate(dto: Partial<CampaignDto>) {
    if (dto.dailyBudget && dto.totalBudget && dto.dailyBudget > dto.totalBudget)
      throw badRequest('Daily budget exceeds total budget', 'INVALID_BUDGET');
    if (dto.endsAt && dto.startsAt && new Date(dto.endsAt) <= new Date(dto.startsAt))
      throw badRequest('End must be after start', 'INVALID_DATES');
  }

  list(tenantId: string) {
    return this.prisma.forTenant(tenantId).adCampaign.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(user: AccessTokenClaims, dto: CampaignDto) {
    this.validate(dto);
    return this.prisma.forTenant(user.tenantId!).adCampaign.create({
      data: {
        ...dto,
        tenantId: user.tenantId!,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        creative: (dto.creative ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async update(user: AccessTokenClaims, id: string, dto: UpdateCampaignDto) {
    const c = await this.owned(user.tenantId!, id);
    if (!['DRAFT', 'PAUSED', 'REJECTED'].includes(c.status))
      throw conflict('Pause the campaign before editing', 'CAMPAIGN_LIVE');
    this.validate({
      ...dto,
      totalBudget: dto.totalBudget ?? Number(c.totalBudget),
      dailyBudget: dto.dailyBudget ?? Number(c.dailyBudget),
    });
    return this.prisma.adCampaign.update({
      where: { id },
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        creative: dto.creative as Prisma.InputJsonValue | undefined,
        ...(c.status === 'REJECTED' ? { status: 'DRAFT' } : {}),
      },
    });
  }

  private async owned(tenantId: string, id: string) {
    const c = await this.prisma.forTenant(tenantId).adCampaign.findUnique({ where: { id } });
    if (!c) throw notFound('Campaign', id);
    return c;
  }

  async submit(user: AccessTokenClaims, id: string) {
    const c = await this.owned(user.tenantId!, id);
    if (c.status !== 'DRAFT') throw conflict('Only drafts can be submitted', 'CAMPAIGN_STATE');
    await this.internal.post('user', 'internal/approvals', {
      entityType: 'AD_CAMPAIGN',
      entityId: c.id,
      tenantId: c.tenantId,
      title: `Ad campaign: ${c.name} (${enumLabel(c.placement)}, ₹${Number(c.totalBudget)})`,
      submittedBy: user.sub,
      metadata: {
        placement: c.placement,
        targetType: c.targetType,
        targetId: c.targetId,
        creative: c.creative,
      },
    });
    return this.prisma.adCampaign.update({ where: { id }, data: { status: 'PENDING_REVIEW' } });
  }

  async setStatus(
    user: AccessTokenClaims,
    id: string,
    status: Extract<CampaignStatus, 'ACTIVE' | 'PAUSED'>,
  ) {
    const c = await this.owned(user.tenantId!, id);
    const allowed = status === 'PAUSED' ? ['ACTIVE'] : ['PAUSED'];
    if (!allowed.includes(c.status))
      throw conflict(
        `Cannot ${status === 'PAUSED' ? 'pause' : 'resume'} a ${c.status.toLowerCase()} campaign`,
        'CAMPAIGN_STATE',
      );
    return this.prisma.adCampaign.update({ where: { id }, data: { status } });
  }

  async stats(tenantId: string, id: string) {
    const c = await this.owned(tenantId, id);
    const daily = await this.prisma.adDailyStats.findMany({
      where: { campaignId: id },
      orderBy: { date: 'asc' },
    });
    const t = daily.reduce(
      (a, d) => ({
        impressions: a.impressions + d.impressions,
        clicks: a.clicks + d.clicks,
        conversions: a.conversions + d.conversions,
        spend: a.spend + Number(d.spend),
        revenue: a.revenue + Number(d.revenue),
      }),
      { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 },
    );
    return {
      campaign: c,
      totals: {
        ...t,
        spend: round2(t.spend),
        revenue: round2(t.revenue),
        ctrPct: t.impressions ? round2((t.clicks / t.impressions) * 100) : 0,
        cpc: t.clicks ? round2(t.spend / t.clicks) : 0,
        conversionRatePct: t.clicks ? round2((t.conversions / t.clicks) * 100) : 0,
        roas: t.spend ? round2(t.revenue / t.spend) : 0,
      },
      daily,
    };
  }

  /** Admin review queue and decision (also reachable via the central approval queue). */
  adminList(status?: CampaignStatus) {
    return this.prisma.adCampaign.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async decide(id: string, approved: boolean, reviewerId: string, notes?: string | null) {
    const c = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!c || c.status !== 'PENDING_REVIEW') return c;
    return this.prisma.adCampaign.update({
      where: { id },
      data: {
        status: approved ? 'ACTIVE' : 'REJECTED',
        reviewedBy: reviewerId,
        reviewNotes: notes,
        spentTodayDate: dateOnly(istDate()),
      },
    });
  }
}
