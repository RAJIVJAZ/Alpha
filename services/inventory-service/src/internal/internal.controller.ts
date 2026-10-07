import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Internal } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import { addDays, dateOnly, istDate, mean, notFound, round2, stdDev, Unit } from '@foodgrid/utils';
import { recipeCost } from '../domain/costing';

/** Data feeds for the procurement engine (blocked at the gateway). */
@ApiTags('internal')
@Internal()
@Controller('internal/inventory')
export class InternalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('tenants')
  @ApiOperation({ summary: 'Tenant/outlet pairs with active ingredients (procurement batch jobs)' })
  tenants() {
    return this.prisma.ingredient.findMany({
      where: { isActive: true },
      distinct: ['tenantId', 'outletId'],
      select: { tenantId: true, outletId: true },
    });
  }

  @Get('stock-status')
  @ApiOperation({ summary: 'Active ingredients with stock levels and 28-day usage statistics' })
  async stockStatus(@Query('tenantId') tenantId: string, @Query('outletId') outletId?: string) {
    const ingredients = await this.prisma.ingredient.findMany({
      where: { tenantId, isActive: true, ...(outletId ? { outletId } : {}) },
    });
    // the 28 complete IST days before today (today is still accumulating)
    const today = dateOnly(istDate());
    const usage = await this.prisma.consumptionDaily.findMany({
      where: {
        tenantId,
        date: { gte: addDays(today, -28), lt: today },
        ingredientId: { in: ingredients.map((i) => i.id) },
      },
    });
    const byIngredient = new Map<string, number[]>();
    for (const u of usage) {
      const list = byIngredient.get(u.ingredientId) ?? [];
      list.push(Number(u.consumedQty) + Number(u.wastedQty));
      byIngredient.set(u.ingredientId, list);
    }
    return ingredients.map((i) => {
      const values = byIngredient.get(i.id) ?? [];
      const padded = [...values, ...Array(Math.max(0, 28 - values.length)).fill(0)];
      return {
        id: i.id,
        tenantId: i.tenantId,
        outletId: i.outletId,
        name: i.name,
        sku: i.sku,
        category: i.category,
        unit: i.unit,
        marketplaceCategory: i.marketplaceCategory,
        preferredSupplierId: i.preferredSupplierId,
        currentStock: Number(i.currentStock),
        reorderLevel: Number(i.reorderLevel),
        reorderQty: Number(i.reorderQty),
        safetyStock: Number(i.safetyStock),
        maxStock: i.maxStock ? Number(i.maxStock) : null,
        leadTimeDays: i.leadTimeDays,
        avgUnitCost: Number(i.avgUnitCost),
        shelfLifeDays: i.shelfLifeDays,
        avgDailyUsage: round2(mean(padded)),
        stdDailyUsage: round2(stdDev(padded)),
      };
    });
  }

  @Get('ingredients/:id')
  async ingredient(@Param('id') id: string) {
    const ing = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!ing) throw notFound('Ingredient', id);
    return ing;
  }

  @Get('ingredients/:id/consumption')
  @ApiOperation({
    summary: 'Zero-filled daily consumption series up to yesterday (forecasting input)',
  })
  async consumption(@Param('id') id: string, @Query('days') days = '90') {
    const span = Math.min(730, Math.max(14, Number(days) || 90));
    // complete days only: a partial today would look like a sudden drop in demand
    const end = addDays(dateOnly(istDate()), -1);
    const start = addDays(end, -span + 1);
    const rows = await this.prisma.consumptionDaily.findMany({
      where: { ingredientId: id, date: { gte: start, lte: end } },
    });
    const byDate = new Map(
      rows.map((r) => [
        r.date.toISOString().slice(0, 10),
        Number(r.consumedQty) + Number(r.wastedQty),
      ]),
    );
    return Array.from({ length: span }, (_, i) => {
      const d = addDays(start, i).toISOString().slice(0, 10);
      return { date: d, value: byDate.get(d) ?? 0 };
    });
  }

  @Get('outlets/:outletId/plate-costs')
  @ApiOperation({ summary: 'Current plate cost per menu item (dynamic pricing input)' })
  async plateCosts(@Param('outletId') outletId: string) {
    const recipes = await this.prisma.recipe.findMany({
      where: { outletId, isActive: true },
      include: { lines: { include: { ingredient: true } } },
    });
    return recipes.map((r) => ({
      menuItemId: r.menuItemId,
      foodCost: recipeCost(
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
      ).perPortion,
    }));
  }
}
