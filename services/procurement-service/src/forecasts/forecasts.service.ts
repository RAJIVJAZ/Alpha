import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import { dateOnly, istDate } from '@foodgrid/utils';
import { ClientsService, StockStatus } from '../clients/clients.service';
import { assertOutletAccess, hasOutletAccess, OutletActor } from '../common/outlet-access';
import { SettingsService } from '../settings/settings.service';

const CONCURRENCY = 5;

/**
 * Pulls each ingredient's consumption history, asks the AI service for a
 * demand forecast (seasonality + festivals + weather) and stores it for the
 * alert engine and the dashboard charts.
 */
@Injectable()
export class ForecastsService {
  private readonly logger = new Logger(ForecastsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly settings: SettingsService,
  ) {}

  async runForTenant(tenantId: string, outletId?: string, user?: OutletActor) {
    if (outletId) assertOutletAccess(user, outletId);
    const settings = await this.settings.get(tenantId);
    const ingredients = (await this.clients.stockStatus(tenantId, outletId)).filter(
      (i) => (i.avgDailyUsage > 0 || i.currentStock > 0) && hasOutletAccess(user, i.outletId),
    );
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < ingredients.length; i += CONCURRENCY) {
      const chunk = ingredients.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((ing) => this.forecastIngredient(ing, settings.forecastHorizonDays)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') ok++;
        else {
          failed++;
          this.logger.warn(`forecast failed: ${(r.reason as Error).message}`);
        }
      }
    }
    return { tenantId, ingredients: ingredients.length, forecasted: ok, failed };
  }

  async forecastIngredient(ing: StockStatus, horizonDays: number) {
    const [series, outlet] = await Promise.all([
      this.clients.consumption(ing.id, 120),
      this.clients.outlet(ing.outletId),
    ]);
    const result = await this.clients.forecast({
      series,
      horizonDays,
      category: ing.marketplaceCategory ?? ing.category,
      city: outlet.city,
      currentStock: ing.currentStock,
      tenantId: ing.tenantId,
    });
    // the series ends yesterday, so the first point is today; only tomorrow onwards is kept
    const today = dateOnly(istDate());
    await this.prisma.$transaction(
      result.points.map((p) =>
        this.prisma.demandForecast.upsert({
          where: {
            ingredientId_forecastDate: { ingredientId: ing.id, forecastDate: dateOnly(p.date) },
          },
          create: {
            tenantId: ing.tenantId,
            outletId: ing.outletId,
            ingredientId: ing.id,
            forecastDate: dateOnly(p.date),
            predictedQty: p.value,
            lowerQty: p.lower,
            upperQty: p.upper,
            model: result.model,
            features: {
              multiplier: p.multiplier,
              signals: p.signals,
              mape: result.mape,
              residualStd: result.residualStd,
            } as Prisma.InputJsonValue,
          },
          update: {
            predictedQty: p.value,
            lowerQty: p.lower,
            upperQty: p.upper,
            model: result.model,
            generatedAt: new Date(),
            features: {
              multiplier: p.multiplier,
              signals: p.signals,
              mape: result.mape,
              residualStd: result.residualStd,
            } as Prisma.InputJsonValue,
          },
        }),
      ),
    );
    await this.prisma.demandForecast.deleteMany({
      where: { ingredientId: ing.id, forecastDate: { lte: today } },
    });
    return result;
  }

  /** History + forecast series for the ingredient chart. */
  async series(tenantId: string, ingredientId: string, user: OutletActor) {
    const ing = await this.clients.ingredient(ingredientId);
    if (ing.tenantId !== tenantId) return { history: [], forecast: [] };
    assertOutletAccess(user, ing.outletId);
    const [history, forecast] = await Promise.all([
      this.clients.consumption(ingredientId, 60),
      this.prisma
        .forTenant(tenantId)
        .demandForecast.findMany({ where: { ingredientId }, orderBy: { forecastDate: 'asc' } }),
    ]);
    return {
      ingredient: { id: ing.id, name: ing.name, unit: ing.unit, currentStock: ing.currentStock },
      history,
      forecast: forecast.map((f) => ({
        date: f.forecastDate.toISOString().slice(0, 10),
        value: Number(f.predictedQty),
        lower: Number(f.lowerQty),
        upper: Number(f.upperQty),
        model: f.model,
        signals: (f.features as { signals?: string[] }).signals ?? [],
      })),
    };
  }
}
