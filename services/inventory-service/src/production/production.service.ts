import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { conflict, dateOnly, notFound, round2, Unit } from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import { forecastItemDemand, plannedQuantity } from '../domain/production';
import { recipeRequirements, round3 } from '../domain/stock';
import { GeneratePlanDto, UpdatePlanItemDto } from './dto/production.dto';

interface ItemSale {
  menuItemId: string;
  name: string;
  date: string;
  quantity: number;
}

/**
 * Production planning: forecast tomorrow's dish volumes from sales history,
 * explode recipes into ingredient requirements and surface shortages that
 * feed the procurement engine.
 */
@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
  ) {}

  async generate(tenantId: string, userId: string, dto: GeneratePlanDto) {
    const planDate = dateOnly(dto.date.slice(0, 10));
    const existing = await this.prisma.productionPlan.findUnique({
      where: { outletId_planDate: { outletId: dto.outletId, planDate } },
    });
    if (existing && existing.status !== 'DRAFT')
      throw conflict('A confirmed plan already exists for this date', 'PLAN_LOCKED');

    const sales = await this.internal.get<ItemSale[]>(
      'order',
      `internal/outlets/${dto.outletId}/item-sales`,
      { query: { days: 28 } },
    );
    const byItem = new Map<
      string,
      { name: string; series: { date: string; quantity: number }[] }
    >();
    for (const s of sales) {
      const e = byItem.get(s.menuItemId) ?? { name: s.name, series: [] };
      e.series.push({ date: s.date, quantity: s.quantity });
      byItem.set(s.menuItemId, e);
    }
    const recipes = await this.prisma
      .forTenant(tenantId)
      .recipe.findMany({ where: { outletId: dto.outletId } });
    const recipeByItem = new Map(recipes.map((r) => [r.menuItemId, r]));

    const items = [...byItem.entries()]
      .map(([menuItemId, e]) => {
        const forecast = forecastItemDemand(e.series, planDate);
        return {
          menuItemId,
          name: e.name,
          recipeId: recipeByItem.get(menuItemId)?.id,
          forecastQty: round2(forecast),
          plannedQty: plannedQuantity(forecast, dto.bufferPct ?? 10),
        };
      })
      .filter((i) => i.plannedQty > 0)
      .sort((a, b) => b.plannedQty - a.plannedQty);

    return this.prisma.$transaction(async (tx) => {
      if (existing) await tx.productionPlan.delete({ where: { id: existing.id } });
      return tx.productionPlan.create({
        data: {
          tenantId,
          outletId: dto.outletId,
          planDate,
          createdBy: userId,
          items: { create: items },
        },
        include: { items: true },
      });
    });
  }

  list(tenantId: string, outletId?: string) {
    return this.prisma.forTenant(tenantId).productionPlan.findMany({
      where: outletId ? { outletId } : {},
      orderBy: { planDate: 'desc' },
      take: 30,
      include: { _count: { select: { items: true } } },
    });
  }

  async get(tenantId: string, id: string) {
    const plan = await this.prisma.forTenant(tenantId).productionPlan.findUnique({
      where: { id },
      include: { items: { orderBy: { plannedQty: 'desc' } } },
    });
    if (!plan) throw notFound('Production plan', id);
    return { ...plan, requirements: await this.requirements(tenantId, plan.items) };
  }

  /** Ingredient requirements for the plan vs stock on hand. */
  private async requirements(
    tenantId: string,
    items: { recipeId: string | null; plannedQty: unknown; producedQty: unknown }[],
  ) {
    const recipeIds = items.map((i) => i.recipeId).filter((x): x is string => !!x);
    if (!recipeIds.length) return [];
    const recipes = await this.prisma.forTenant(tenantId).recipe.findMany({
      where: { id: { in: recipeIds } },
      include: { lines: { include: { ingredient: true } } },
    });
    const totals = new Map<string, number>();
    const ingredients = new Map<
      string,
      { name: string; unit: string; currentStock: number; category: string }
    >();
    for (const item of items) {
      const recipe = recipes.find((r) => r.id === item.recipeId);
      if (!recipe) continue;
      const remaining = Math.max(0, Number(item.plannedQty) - Number(item.producedQty));
      const units = new Map(recipe.lines.map((l) => [l.ingredientId, l.ingredient.unit as Unit]));
      const req = recipeRequirements(
        recipe.lines.map((l) => ({
          ingredientId: l.ingredientId,
          quantity: Number(l.quantity),
          unit: l.unit as Unit,
          wastagePct: Number(l.wastagePct),
        })),
        units,
        remaining,
        Number(recipe.yieldQty),
      );
      for (const [id, qty] of req) totals.set(id, round3((totals.get(id) ?? 0) + qty));
      for (const l of recipe.lines) {
        ingredients.set(l.ingredientId, {
          name: l.ingredient.name,
          unit: l.ingredient.unit,
          currentStock: Number(l.ingredient.currentStock),
          category: l.ingredient.category,
        });
      }
    }
    return [...totals.entries()]
      .map(([ingredientId, required]) => {
        const ing = ingredients.get(ingredientId)!;
        return {
          ingredientId,
          ...ing,
          required,
          shortage: round3(Math.max(0, required - ing.currentStock)),
        };
      })
      .sort((a, b) => b.shortage - a.shortage);
  }

  async updateItem(tenantId: string, planId: string, itemId: string, dto: UpdatePlanItemDto) {
    const plan = await this.prisma
      .forTenant(tenantId)
      .productionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw notFound('Production plan', planId);
    if (['COMPLETED', 'CANCELLED'].includes(plan.status))
      throw conflict('Plan is closed', 'PLAN_CLOSED');
    return this.prisma.productionPlanItem.update({ where: { id: itemId, planId }, data: dto });
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
  ) {
    const plan = await this.prisma.forTenant(tenantId).productionPlan.findUnique({ where: { id } });
    if (!plan) throw notFound('Production plan', id);
    const allowed: Record<string, string[]> = {
      DRAFT: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED'],
    };
    if (!(allowed[plan.status] ?? []).includes(status))
      throw conflict(`Cannot move plan from ${plan.status} to ${status}`, 'PLAN_STATE');
    return this.prisma.productionPlan.update({ where: { id }, data: { status } });
  }
}
