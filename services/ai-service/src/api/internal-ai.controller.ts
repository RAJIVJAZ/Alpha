import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Internal } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import { addDays, dateOnly } from '@foodgrid/utils';
import { ModelRunsService } from '../common/model-runs.service';
import { deliverySurge, markdown } from '../engines/dynamic-pricing';
import { forecastDemand, predictDepletion } from '../engines/forecasting';
import { analyseTrajectory, scoreOrderRisk } from '../engines/fraud';
import { abcClassify, optimizeItem } from '../engines/inventory-optimization';
import { scoreOutlet } from '../engines/outlet-scoring';
import { rankOutlets, recommendItems } from '../engines/recommendations';
import { optimizeRoute } from '../engines/routing';
import { bestByStrategy, rankSuppliers } from '../engines/supplier-ranking';
import {
  DemandForecastDto,
  FraudScoreDto,
  InventoryOptimizeDto,
  ItemRecoDto,
  MarkdownDto,
  OutletRecoDto,
  OutletScoreDto,
  RankSuppliersDto,
  RouteDto,
  SurgeDto,
  TrajectoryDto,
} from './dto';
import { SignalsService } from './signals.service';

/**
 * Stateless model serving for other services. Data owners send features; the
 * AI service returns predictions and keeps an audit trail of every run.
 */
@ApiTags('internal')
@Internal()
@Controller('internal/ai')
export class InternalAiController {
  constructor(
    private readonly runs: ModelRunsService,
    private readonly prisma: PrismaService,
    private readonly signals: SignalsService,
  ) {}

  @Post('forecast/demand')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Daily demand forecast (Holt-Winters + festival/weather signals) and depletion date',
  })
  async forecast(@Body() dto: DemandForecastDto) {
    const series = [...dto.series].sort((a, b) => a.date.localeCompare(b.date));
    const startDate = series[0]?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const end = addDays(dateOnly(startDate), series.length + dto.horizonDays);
    const signals = await this.signals.between(dto.city ?? null, dateOnly(startDate), end);
    return this.runs.track(
      'DEMAND_FORECAST',
      dto.tenantId,
      () => {
        const result = forecastDemand({
          series: series.map((p) => p.value),
          startDate,
          horizon: dto.horizonDays,
          category: dto.category,
          signals: signals.map((s) => ({
            date: s.date.toISOString().slice(0, 10),
            impact: s.impact,
            name: s.name,
            categories: s.categories,
          })),
        });
        return dto.currentStock === undefined
          ? result
          : { ...result, depletion: predictDepletion(dto.currentStock, result.points) };
      },
      (r) => ({
        model: r.model,
        mape: r.mape,
        horizon: dto.horizonDays,
        observations: series.length,
      }),
    );
  }

  @Post('inventory/optimize')
  @HttpCode(200)
  @ApiOperation({ summary: 'Safety stock, reorder point, EOQ, ABC class and risk flags' })
  optimize(@Body() dto: InventoryOptimizeDto) {
    return this.runs.track(
      'INVENTORY_OPTIMIZATION',
      dto.tenantId,
      () =>
        abcClassify(dto.items.map((i) => optimizeItem(i, dto.serviceLevel, dto.reviewPeriodDays))),
      (r) => ({
        items: r.length,
        atRisk: r.filter((p) => p.flags.includes('STOCKOUT_RISK')).length,
      }),
    );
  }

  @Post('suppliers/rank')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rank supplier offers; also returns the best offer per strategy' })
  rank(@Body() dto: RankSuppliersDto) {
    return this.runs.track(
      'SUPPLIER_RECOMMENDATION',
      dto.tenantId,
      () => ({
        options: rankSuppliers(dto.offers, dto.quantity, dto.strategy),
        best: bestByStrategy(dto.offers, dto.quantity),
      }),
      (r) => ({
        offers: dto.offers.length,
        strategy: dto.strategy,
        winner: r.options[0]?.supplierTenantId,
      }),
    );
  }

  @Post('pricing/delivery-surge')
  @HttpCode(200)
  surge(@Body() dto: SurgeDto) {
    return this.runs.track(
      'DYNAMIC_PRICING',
      null,
      () => deliverySurge(dto),
      (r) => ({ multiplier: r.multiplier }),
    );
  }

  @Post('pricing/markdown')
  @HttpCode(200)
  markdown(@Body() dto: MarkdownDto) {
    return this.runs.track('DYNAMIC_PRICING', null, () => dto.products.map(markdown));
  }

  @Post('fraud/score')
  @HttpCode(200)
  @ApiOperation({ summary: 'Order risk score with decision (ALLOW / REVIEW / BLOCK) and reasons' })
  async fraud(@Body() dto: FraudScoreDto) {
    const result = await this.runs.track(
      'FRAUD_DETECTION',
      null,
      () => scoreOrderRisk(dto.features),
      (r) => ({ score: r.score, decision: r.decision }),
    );
    await this.prisma.fraudAssessment.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        userId: dto.userId,
        score: result.score,
        decision: result.decision,
        reasons: result.reasons,
        features: {
          ...dto.features,
          contributions: result.contributions,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  @Post('fraud/rider-trajectory')
  @HttpCode(200)
  async trajectory(@Body() dto: TrajectoryDto) {
    const result = await this.runs.track('FRAUD_DETECTION', null, () =>
      analyseTrajectory(dto.pings, dto.drop),
    );
    if (result.decision !== 'ALLOW') {
      await this.prisma.fraudAssessment.create({
        data: {
          entityType: 'RIDER',
          entityId: dto.deliveryId,
          userId: dto.riderId,
          score: result.score,
          decision: result.decision,
          reasons: [...result.reasons],
          features: {
            anomalies: result.anomalies,
            distanceFromDropM: result.distanceFromDropM,
          } as Prisma.InputJsonValue,
        },
      });
    }
    return result;
  }

  @Post('routes/optimize')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pickup & drop route optimisation (precedence-constrained, 2-opt)' })
  route(@Body() dto: RouteDto) {
    return this.runs.track(
      'ROUTE_OPTIMIZATION',
      null,
      () => optimizeRoute(dto),
      (r) => ({ stops: r.stops.length, km: r.totalKm, savedKm: r.improvedByKm }),
    );
  }

  @Post('recommendations/outlets')
  @HttpCode(200)
  outlets(@Body() dto: OutletRecoDto) {
    return this.runs.track(
      'CUSTOMER_RECOMMENDATION',
      null,
      () => rankOutlets(dto.history, dto.candidates),
      (r) => ({ candidates: r.length, coldStart: dto.history.length < 2 }),
    );
  }

  @Post('recommendations/items')
  @HttpCode(200)
  items(@Body() dto: ItemRecoDto) {
    return this.runs.track('CUSTOMER_RECOMMENDATION', null, () =>
      recommendItems(dto.baskets, dto.seedItemIds, dto.limit),
    );
  }

  @Post('outlets/score')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restaurant performance score (0-100, grade A–E) with tips' })
  async score(@Body() dto: OutletScoreDto) {
    const result = await this.runs.track(
      'OUTLET_SCORING',
      dto.tenantId,
      () => scoreOutlet(dto.metrics),
      (r) => ({ score: r.score, grade: r.grade }),
    );
    const periodStart = dateOnly(dto.periodStart.slice(0, 10));
    const periodEnd = dateOnly(dto.periodEnd.slice(0, 10));
    await this.prisma.outletScore.upsert({
      where: { outletId_periodStart_periodEnd: { outletId: dto.outletId, periodStart, periodEnd } },
      create: {
        tenantId: dto.tenantId,
        outletId: dto.outletId,
        periodStart,
        periodEnd,
        score: result.score,
        grade: result.grade,
        components: result.components,
        recommendations: result.recommendations,
      },
      update: {
        score: result.score,
        grade: result.grade,
        components: result.components,
        recommendations: result.recommendations,
      },
    });
    return result;
  }

  @Get('signals')
  @ApiOperation({ summary: 'Festival / weather / event signals for a city and window' })
  listSignals(
    @Query('city') city: string | undefined,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.signals.between(
      city ?? null,
      dateOnly(from.slice(0, 10)),
      dateOnly(to.slice(0, 10)),
    );
  }
}
