import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Ingredient, Prisma } from '@foodgrid/database';
import type { IngredientView } from '@foodgrid/types';
import { conflict, normalizePage, notFound, paginate, round2 } from '@foodgrid/utils';
import { stockState } from '../domain/stock';
import { InternalHttpService } from '@foodgrid/utils/server';
import { StockService } from '../stock/stock.service';
import { IngredientDto, ListIngredientsDto, UpdateIngredientDto } from './dto/ingredient.dto';

/** Maps inventory categories to B2B marketplace category codes for procurement. */
export const DEFAULT_MARKETPLACE_CATEGORY: Partial<Record<Ingredient['category'], string>> = {
  FLOUR: 'FLOUR',
  OIL: 'OIL',
  SUGAR: 'SUGAR',
  DAIRY: 'DAIRY',
  VEGETABLES: 'VEGETABLES',
  FRUITS: 'FRUITS',
  PACKAGING: 'PACKAGING',
  SPICES: 'SPICES',
  GRAINS: 'RICE',
  PULSES: 'PULSES',
  BEVERAGES: 'BEVERAGES',
  FROZEN: 'FROZEN',
};

export function toIngredientView(i: Ingredient): IngredientView {
  const current = Number(i.currentStock);
  return {
    id: i.id,
    name: i.name,
    sku: i.sku,
    category: i.category,
    unit: i.unit,
    currentStock: i.currentStock.toString(),
    reorderLevel: i.reorderLevel.toString(),
    avgUnitCost: i.avgUnitCost.toString(),
    stockValue: round2(Math.max(0, current) * Number(i.avgUnitCost)).toFixed(2),
    status: stockState(current, Number(i.reorderLevel)),
  };
}

@Injectable()
export class IngredientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly internal: InternalHttpService,
  ) {}

  async create(tenantId: string, userId: string, dto: IngredientDto) {
    const outlet = await this.internal
      .get<{ id: string; tenantId: string }>('order', `internal/outlets/${dto.outletId}`)
      .catch(() => null);
    if (!outlet || outlet.tenantId !== tenantId) throw notFound('Outlet', dto.outletId);
    const { openingStock, openingUnitCost, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.ingredient.findUnique({ where: { outletId_sku: { outletId: dto.outletId, sku: dto.sku } } });
      if (exists) throw conflict(`SKU ${dto.sku} already exists at this outlet`, 'DUPLICATE_SKU');
      const created = await tx.ingredient.create({
        data: {
          ...data,
          tenantId,
          marketplaceCategory: dto.marketplaceCategory ?? DEFAULT_MARKETPLACE_CATEGORY[dto.category] ?? null,
          isPerishable: dto.isPerishable ?? ['DAIRY', 'VEGETABLES', 'FRUITS', 'MEAT_SEAFOOD', 'BAKERY'].includes(dto.category),
        },
      });
      if (openingStock && openingStock > 0) {
        await this.stock.receiveInTx(
          tx,
          tenantId,
          { ingredientId: created.id, quantity: openingStock, unitCost: openingUnitCost ?? 0 },
          { type: 'OPENING', referenceType: 'OPENING', createdBy: userId },
        );
      }
      return tx.ingredient.findUniqueOrThrow({ where: { id: created.id } });
    });
  }

  async list(tenantId: string, q: ListIngredientsDto) {
    const where: Prisma.IngredientWhereInput = {
      outletId: q.outletId,
      category: q.category,
      isActive: true,
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q.toUpperCase() } }] } : {}),
    };
    const rows = await this.prisma.forTenant(tenantId).ingredient.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    const views = rows.map(toIngredientView).filter((v) => !q.status || v.status === q.status);
    const { page, pageSize, skip } = normalizePage(q, 500);
    return paginate(views.slice(skip, skip + pageSize), views.length, page, pageSize);
  }

  async get(tenantId: string, id: string) {
    const ing = await this.prisma.forTenant(tenantId).ingredient.findUnique({
      where: { id },
      include: {
        batches: { where: { remainingQty: { gt: 0 } }, orderBy: [{ expiresAt: 'asc' }, { receivedAt: 'asc' }] },
        movements: { orderBy: { createdAt: 'desc' }, take: 20 },
        consumption: { orderBy: { date: 'desc' }, take: 30 },
      },
    });
    if (!ing) throw notFound('Ingredient', id);
    return { ...ing, view: toIngredientView(ing) };
  }

  async update(tenantId: string, id: string, dto: UpdateIngredientDto) {
    const ing = await this.prisma.forTenant(tenantId).ingredient.findUnique({ where: { id } });
    if (!ing) throw notFound('Ingredient', id);
    return this.prisma.ingredient.update({ where: { id }, data: dto });
  }

  /** Inventory dashboard: value and health per category, expiring batches. */
  async summary(tenantId: string, outletId?: string) {
    const db = this.prisma.forTenant(tenantId);
    const ingredients = await db.ingredient.findMany({ where: { isActive: true, ...(outletId ? { outletId } : {}) } });
    const byCategory = new Map<string, { category: string; items: number; value: number; low: number; out: number }>();
    for (const i of ingredients) {
      const v = toIngredientView(i);
      const c = byCategory.get(i.category) ?? { category: i.category, items: 0, value: 0, low: 0, out: 0 };
      c.items += 1;
      c.value = round2(c.value + Number(v.stockValue));
      if (v.status === 'LOW') c.low += 1;
      if (v.status === 'OUT') c.out += 1;
      byCategory.set(i.category, c);
    }
    const soon = new Date(Date.now() + 3 * 86_400_000);
    const expiring = await db.stockBatch.findMany({
      where: { remainingQty: { gt: 0 }, expiresAt: { lte: soon }, ...(outletId ? { ingredient: { outletId } } : {}) },
      include: { ingredient: { select: { name: true, unit: true } } },
      orderBy: { expiresAt: 'asc' },
      take: 50,
    });
    const categories = [...byCategory.values()].sort((a, b) => b.value - a.value);
    return {
      totalItems: ingredients.length,
      totalValue: round2(categories.reduce((s, c) => s + c.value, 0)),
      lowStock: categories.reduce((s, c) => s + c.low, 0),
      outOfStock: categories.reduce((s, c) => s + c.out, 0),
      categories,
      expiringSoon: expiring.map((b) => ({
        batchId: b.id,
        ingredient: b.ingredient.name,
        unit: b.ingredient.unit,
        remainingQty: b.remainingQty,
        expiresAt: b.expiresAt,
        value: round2(Number(b.remainingQty) * Number(b.unitCost)),
      })),
    };
  }
}
