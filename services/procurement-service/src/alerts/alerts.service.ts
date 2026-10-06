import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { addDays, dateOnly, istDate, notFound } from '@foodgrid/utils';
import { ClientsService, StockStatus } from '../clients/clients.service';
import { assessIngredient } from '../domain/assessment';
import { OPEN_PO_STATUSES } from '../domain/po-state';
import { SettingsService } from '../settings/settings.service';

/**
 * Reorder alert engine: combines live stock, stored forecasts and lead times
 * to decide which ingredients must be bought now, how much, and how urgent.
 */
@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly settings: SettingsService,
  ) {}

  async scan(tenantId: string, outletId?: string, onlyIngredientId?: string) {
    const settings = await this.settings.get(tenantId);
    let ingredients = await this.clients.stockStatus(tenantId, outletId);
    if (onlyIngredientId) ingredients = ingredients.filter((i) => i.id === onlyIngredientId);
    const tomorrow = addDays(dateOnly(istDate()), 1);
    const forecasts = await this.prisma.forTenant(tenantId).demandForecast.findMany({
      where: { ingredientId: { in: ingredients.map((i) => i.id) }, forecastDate: { gte: tomorrow } },
      orderBy: { forecastDate: 'asc' },
    });
    const byIngredient = new Map<string, typeof forecasts>();
    for (const f of forecasts) {
      const list = byIngredient.get(f.ingredientId) ?? [];
      list.push(f);
      byIngredient.set(f.ingredientId, list);
    }
    // ingredients already covered by an in-flight PO are not re-alerted
    const inflight = await this.prisma.forTenant(tenantId).purchaseOrder.findMany({
      where: { status: { in: OPEN_PO_STATUSES } },
      select: { items: { select: { ingredientId: true } } },
    });
    const covered = new Set(inflight.flatMap((p) => p.items.map((i) => i.ingredientId)).filter(Boolean) as string[]);

    let opened = 0;
    let resolved = 0;
    for (const ing of ingredients) {
      const fc = byIngredient.get(ing.id) ?? [];
      const a = assessIngredient({
        currentStock: ing.currentStock,
        reorderLevel: ing.reorderLevel,
        reorderQty: ing.reorderQty,
        maxStock: ing.maxStock,
        leadTimeDays: ing.leadTimeDays,
        forecast: fc.length ? fc.map((f) => Number(f.predictedQty)) : Array(14).fill(ing.avgDailyUsage),
        forecastDates: fc.length ? fc.map((f) => f.forecastDate.toISOString().slice(0, 10)) : Array.from({ length: 14 }, (_, d) => addDays(tomorrow, d).toISOString().slice(0, 10)),
        demandStd: ing.stdDailyUsage,
        serviceLevel: settings.serviceLevel,
        reviewPeriodDays: settings.reviewPeriodDays,
      });
      const open = await this.prisma.reorderAlert.findFirst({ where: { ingredientId: ing.id, status: 'OPEN' } });
      if (a.needsReorder && !covered.has(ing.id) && a.suggestedQty > 0) {
        const data = this.alertData(ing, a);
        if (open) await this.prisma.reorderAlert.update({ where: { id: open.id }, data });
        else {
          await this.prisma.reorderAlert.create({ data: { ...data, tenantId: ing.tenantId, outletId: ing.outletId, ingredientId: ing.id } });
          opened++;
        }
      } else if (open && !a.needsReorder) {
        await this.prisma.reorderAlert.update({ where: { id: open.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
        resolved++;
      }
    }
    return { scanned: ingredients.length, opened, resolved };
  }

  private alertData(ing: StockStatus, a: ReturnType<typeof assessIngredient>) {
    return {
      ingredientName: ing.name,
      category: ing.category,
      unit: ing.unit,
      currentStock: ing.currentStock,
      reorderLevel: a.reorderPoint,
      avgDailyUsage: a.avgDailyUsage,
      daysOfCover: a.daysOfCover,
      predictedDepletionDate: a.depletionDate ? dateOnly(a.depletionDate) : null,
      suggestedQty: a.suggestedQty,
      severity: a.severity,
    };
  }

  list(tenantId: string, q: { status?: string; outletId?: string; severity?: string }) {
    return this.prisma.forTenant(tenantId).reorderAlert.findMany({
      where: {
        status: (q.status as 'OPEN' | undefined) ?? 'OPEN',
        outletId: q.outletId,
        severity: q.severity as 'HIGH' | undefined,
      },
      orderBy: [{ severity: 'desc' }, { daysOfCover: 'asc' }],
    });
  }

  async dismiss(tenantId: string, id: string) {
    const alert = await this.prisma.forTenant(tenantId).reorderAlert.findUnique({ where: { id } });
    if (!alert) throw notFound('Alert', id);
    return this.prisma.reorderAlert.update({ where: { id }, data: { status: 'DISMISSED', resolvedAt: new Date() } });
  }
}
