import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import type { FraudDecision, Prisma } from '@foodgrid/database';
import { notFound, normalizePage, paginate } from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import { ModelRunsService } from '../common/model-runs.service';
import { PricePoint, suggestMenuPrice } from '../engines/dynamic-pricing';
import { ReviewFraudDto, SignalDto } from './dto';
import { SignalsService } from './signals.service';

interface ItemSale {
  menuItemId: string;
  name: string;
  date: string;
  quantity: number;
  avgPrice?: number;
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller()
export class AiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
    private readonly runs: ModelRunsService,
    private readonly signals: SignalsService,
  ) {}

  // ─── merchant: dynamic menu pricing ───────────────────────────────────────
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.PricingManage)
  @Post('ai/pricing/menu-suggestions')
  @ApiOperation({
    summary: 'Generate price suggestions from sales history, elasticity and plate cost',
  })
  async menuSuggestions(@TenantId() tenantId: string, @Query('outletId') outletId: string) {
    const outlet = await this.internal.get<{ tenantId: string }>(
      'order',
      `internal/outlets/${outletId}`,
    );
    if (outlet.tenantId !== tenantId) throw notFound('Outlet', outletId);
    const [prices, sales, costs] = await Promise.all([
      this.internal.get<{ id: string; name: string; price: string; isAvailable: boolean }[]>(
        'order',
        `internal/outlets/${outletId}/menu-prices`,
      ),
      this.internal.get<ItemSale[]>('order', `internal/outlets/${outletId}/item-sales`, {
        query: { days: 90 },
      }),
      this.internal
        .get<{ menuItemId: string; foodCost: number }[]>(
          'inventory',
          `internal/inventory/outlets/${outletId}/plate-costs`,
        )
        .catch(() => []),
    ]);
    const costByItem = new Map(costs.map((c) => [c.menuItemId, c.foodCost]));
    const history = new Map<string, PricePoint[]>();
    for (const s of sales) {
      if (!s.avgPrice) continue;
      const list = history.get(s.menuItemId) ?? [];
      list.push({ price: s.avgPrice, quantity: s.quantity });
      history.set(s.menuItemId, list);
    }
    const suggestions = await this.runs.track('DYNAMIC_PRICING', tenantId, () =>
      prices
        .filter((p) => p.isAvailable && costByItem.has(p.id))
        .map((p) =>
          suggestMenuPrice({
            id: p.id,
            name: p.name,
            price: Number(p.price),
            unitCost: costByItem.get(p.id)!,
            history: history.get(p.id) ?? [],
          }),
        )
        .filter((s) => Math.abs(s.changePct) >= 2),
    );
    await this.prisma.pricingSuggestion.updateMany({
      where: { tenantId, targetType: 'MENU_ITEM', status: 'SUGGESTED' },
      data: { status: 'EXPIRED' },
    });
    if (suggestions.length) {
      await this.prisma.pricingSuggestion.createMany({
        data: suggestions.map((s) => ({
          tenantId,
          targetType: 'MENU_ITEM' as const,
          targetId: s.id,
          targetName: s.name,
          currentPrice: s.currentPrice,
          suggestedPrice: s.suggestedPrice,
          changePct: s.changePct,
          reason: s.reason,
          confidence: s.confidence,
          factors: { elasticity: s.elasticity, outletId } as Prisma.InputJsonValue,
          validUntil: new Date(Date.now() + 7 * 86_400_000),
        })),
      });
    }
    return { generated: suggestions.length, suggestions };
  }

  @RequireTenant()
  @RequirePermissions(Permissions.PricingManage)
  @Get('ai/pricing/suggestions')
  suggestions(@TenantId() tenantId: string) {
    return this.prisma.pricingSuggestion.findMany({
      where: { tenantId, status: 'SUGGESTED' },
      orderBy: { confidence: 'desc' },
    });
  }

  @RequireTenant()
  @RequirePermissions(Permissions.PricingManage)
  @Post('ai/pricing/suggestions/:id/:action')
  @HttpCode(200)
  async decide(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('action') action: 'apply' | 'dismiss',
  ) {
    const s = await this.prisma.pricingSuggestion.findFirst({ where: { id, tenantId } });
    if (!s) throw notFound('Suggestion', id);
    return this.prisma.pricingSuggestion.update({
      where: { id },
      data:
        action === 'apply' ? { status: 'APPLIED', appliedAt: new Date() } : { status: 'DISMISSED' },
    });
  }

  // ─── outlet performance scores ────────────────────────────────────────────
  @RequireTenant('RESTAURANT', 'FOOD_CART')
  @RequirePermissions(Permissions.ReportsRead)
  @Get('ai/outlet-scores')
  @ApiOperation({ summary: 'Restaurant performance score history' })
  outletScores(@TenantId() tenantId: string, @Query('outletId') outletId?: string) {
    return this.prisma.outletScore.findMany({
      where: { tenantId, outletId },
      orderBy: { periodEnd: 'desc' },
      take: 26,
    });
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('admin/ai/outlet-scores')
  async leaderboard(@Query('grade') grade?: string) {
    const latest = await this.prisma.outletScore.findMany({
      orderBy: { periodEnd: 'desc' },
      take: 2000,
      where: grade ? { grade } : {},
    });
    const seen = new Set<string>();
    return latest
      .filter((s) => (seen.has(s.outletId) ? false : (seen.add(s.outletId), true)))
      .sort((a, b) => b.score - a.score);
  }

  // ─── fraud review queue ───────────────────────────────────────────────────
  @RequirePermissions(Permissions.PlatformFraud)
  @Get('admin/ai/fraud/assessments')
  @ApiOperation({ summary: 'Fraud review queue' })
  async fraudQueue(
    @Query('decision') decision: FraudDecision = 'REVIEW',
    @Query('page') page?: number,
  ) {
    const p = normalizePage({ page, pageSize: 50 });
    const where: Prisma.FraudAssessmentWhereInput = { decision, reviewedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.fraudAssessment.findMany({
        where,
        orderBy: { score: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.fraudAssessment.count({ where }),
    ]);
    return paginate(rows, total, p.page, p.pageSize);
  }

  @RequirePermissions(Permissions.PlatformFraud)
  @Post('admin/ai/fraud/assessments/:id/review')
  @HttpCode(200)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewFraudDto,
    @CurrentUser('sub') reviewer: string,
  ) {
    return this.prisma.fraudAssessment.update({
      where: { id },
      data: { reviewOutcome: dto.outcome, reviewedBy: reviewer, reviewedAt: new Date() },
    });
  }

  @RequirePermissions(Permissions.PlatformFraud)
  @Get('admin/ai/fraud/stats')
  async fraudStats() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [byDecision, outcomes] = await Promise.all([
      this.prisma.fraudAssessment.groupBy({
        by: ['decision'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.fraudAssessment.groupBy({
        by: ['reviewOutcome'],
        where: { reviewedAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    return {
      last30Days: Object.fromEntries(byDecision.map((d) => [d.decision, d._count._all])),
      reviewOutcomes: Object.fromEntries(
        outcomes.map((o) => [o.reviewOutcome ?? 'PENDING', o._count._all]),
      ),
    };
  }

  // ─── demand signals (festival calendar, weather) ─────────────────────────
  @RequirePermissions(Permissions.PlatformConfig)
  @Get('admin/ai/signals')
  listSignals(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('city') city?: string,
  ) {
    return this.signals.list({ from, to, city });
  }

  @RequirePermissions(Permissions.PlatformConfig)
  @Post('admin/ai/signals')
  createSignal(@Body() dto: SignalDto) {
    return this.signals.create(dto);
  }

  @RequirePermissions(Permissions.PlatformConfig)
  @Delete('admin/ai/signals/:id')
  @HttpCode(204)
  async deleteSignal(@Param('id') id: string) {
    await this.signals.remove(id);
  }

  @RequirePermissions(Permissions.PlatformConfig)
  @Post('admin/ai/signals/weather/sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sync the weather forecast now (also runs every 3 hours)' })
  syncWeather() {
    return this.signals.syncWeather();
  }

  @RequirePermissions(Permissions.PlatformAnalytics)
  @Get('admin/ai/model-runs')
  @ApiOperation({ summary: 'Model invocation stats (last 24h)' })
  async modelRuns() {
    const since = new Date(Date.now() - 86_400_000);
    const rows = await this.prisma.aiModelRun.groupBy({
      by: ['kind', 'success'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { durationMs: true },
    });
    return rows.map((r) => ({
      kind: r.kind,
      success: r.success,
      runs: r._count._all,
      avgMs: Math.round(r._avg.durationMs ?? 0),
    }));
  }
}
