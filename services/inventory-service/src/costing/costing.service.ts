import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { dateOnly, istDate, notFound, round2, Unit } from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import { menuCostRow, recipeCost } from '../domain/costing';

interface MenuPrice {
  id: string;
  name: string;
  price: string;
  isAvailable: boolean;
}

/** Menu engineering: food cost %, margin and high-cost flags per menu item. */
@Injectable()
export class CostingService {
  private readonly logger = new Logger(CostingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
  ) {}

  async report(tenantId: string, outletId: string) {
    const outlet = await this.internal
      .get<{ tenantId: string }>('order', `internal/outlets/${outletId}`)
      .catch(() => null);
    if (!outlet || outlet.tenantId !== tenantId) throw notFound('Outlet', outletId);
    const [prices, recipes] = await Promise.all([
      this.internal.get<MenuPrice[]>('order', `internal/outlets/${outletId}/menu-prices`),
      this.prisma.forTenant(tenantId).recipe.findMany({
        where: { outletId },
        include: { lines: { include: { ingredient: true } } },
      }),
    ]);
    const byItem = new Map(recipes.map((r) => [r.menuItemId, r]));
    const rows = prices.map((p) => {
      const r = byItem.get(p.id);
      const cost = r
        ? recipeCost(
            r.lines.map((l) => ({
              ingredientId: l.ingredientId,
              name: l.ingredient.name,
              quantity: Number(l.quantity),
              unit: l.unit as Unit,
              wastagePct: Number(l.wastagePct),
              ingredientUnit: l.ingredient.unit as Unit,
              avgUnitCost: Number(l.ingredient.avgUnitCost),
            })),
            Number(r.yieldQty),
          ).perPortion
        : null;
      return menuCostRow(p.id, p.name, Number(p.price), cost);
    });
    const costed = rows.filter((r) => r.foodCostPct !== null);
    return {
      outletId,
      items: rows.sort((a, b) => (b.foodCostPct ?? -1) - (a.foodCostPct ?? -1)),
      averageFoodCostPct: costed.length
        ? round2(costed.reduce((s, r) => s + r.foodCostPct!, 0) / costed.length)
        : null,
      highCostItems: rows.filter((r) => r.flag === 'HIGH_COST').length,
      missingRecipes: rows.filter((r) => r.flag === 'NO_RECIPE').length,
    };
  }

  /** Daily snapshot for food-cost trend charts. */
  async snapshot(tenantId: string, outletId: string) {
    const report = await this.report(tenantId, outletId);
    const date = dateOnly(istDate());
    let written = 0;
    for (const row of report.items) {
      if (row.foodCost === null) continue;
      await this.prisma.costSnapshot.upsert({
        where: { menuItemId_date: { menuItemId: row.menuItemId, date } },
        create: {
          tenantId,
          outletId,
          menuItemId: row.menuItemId,
          date,
          sellingPrice: row.sellingPrice,
          foodCost: row.foodCost,
          foodCostPct: row.foodCostPct!,
          marginPct: row.marginPct!,
        },
        update: {
          sellingPrice: row.sellingPrice,
          foodCost: row.foodCost,
          foodCostPct: row.foodCostPct!,
          marginPct: row.marginPct!,
        },
      });
      written++;
    }
    return { outletId, written };
  }

  trend(tenantId: string, menuItemId: string) {
    return this.prisma
      .forTenant(tenantId)
      .costSnapshot.findMany({ where: { menuItemId }, orderBy: { date: 'asc' }, take: 120 });
  }
}
