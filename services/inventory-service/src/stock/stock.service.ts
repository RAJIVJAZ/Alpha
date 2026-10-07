import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Ingredient, Prisma, StockMovementType } from '@foodgrid/database';
import { EventTypes, StockLowEvent } from '@foodgrid/types';
import {
  badRequest,
  dateOnly,
  istDate,
  normalizePage,
  notFound,
  paginate,
  round2,
} from '@foodgrid/utils';
import { OutboxService, resolveIstRange } from '@foodgrid/utils/server';
import { allocateFefo, crossedReorderLevel, round3, weightedAverageCost } from '../domain/stock';
import { AdjustStockDto, MovementsQueryDto, ReceiveStockDto, WastageDto } from './dto/stock.dto';

type Tx = Prisma.TransactionClient;

export interface OutflowInput {
  ingredientId: string;
  quantity: number;
  type: Extract<StockMovementType, 'CONSUMPTION' | 'WASTAGE' | 'TRANSFER_OUT' | 'ADJUSTMENT'>;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  createdBy?: string;
}

/**
 * All stock changes go through here: FEFO batch depletion, weighted average
 * cost on receipt, an immutable movement ledger with running balance, the
 * daily consumption roll-up and low-stock events.
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  private async lockIngredient(tx: Tx, id: string): Promise<Ingredient> {
    await tx.$queryRaw`SELECT id FROM "inventory"."Ingredient" WHERE id = ${id} FOR UPDATE`;
    const ing = await tx.ingredient.findUnique({ where: { id } });
    if (!ing) throw notFound('Ingredient', id);
    return ing;
  }

  /** Receipt into stock (GRN): new batch + WAC update. */
  async receiveInTx(
    tx: Tx,
    tenantId: string,
    line: {
      ingredientId: string;
      quantity: number;
      unitCost: number;
      batchNumber?: string;
      expiresAt?: Date | null;
    },
    ref: {
      type: StockMovementType;
      referenceType?: string;
      referenceId?: string;
      supplierTenantId?: string;
      createdBy?: string;
      reason?: string;
    },
  ) {
    const ing = await this.lockIngredient(tx, line.ingredientId);
    if (ing.tenantId !== tenantId) throw notFound('Ingredient', line.ingredientId);
    const before = Number(ing.currentStock);
    const after = round3(before + line.quantity);
    const expiresAt =
      line.expiresAt ??
      (ing.shelfLifeDays ? new Date(Date.now() + ing.shelfLifeDays * 86_400_000) : null);
    await tx.stockBatch.create({
      data: {
        tenantId,
        ingredientId: ing.id,
        batchNumber: line.batchNumber,
        quantity: line.quantity,
        remainingQty: line.quantity,
        unitCost: line.unitCost,
        expiresAt,
        purchaseOrderId: ref.referenceType === 'PURCHASE_ORDER' ? ref.referenceId : undefined,
        supplierTenantId: ref.supplierTenantId,
      },
    });
    await tx.ingredient.update({
      where: { id: ing.id },
      data: {
        currentStock: after,
        avgUnitCost: weightedAverageCost(
          before,
          Number(ing.avgUnitCost),
          line.quantity,
          line.unitCost,
        ),
        lastPurchasePrice: line.unitCost,
      },
    });
    return tx.stockMovement.create({
      data: {
        tenantId,
        outletId: ing.outletId,
        ingredientId: ing.id,
        type: ref.type,
        quantity: line.quantity,
        unitCost: line.unitCost,
        totalCost: round2(line.quantity * line.unitCost),
        balanceAfter: after,
        referenceType: ref.referenceType,
        referenceId: ref.referenceId,
        reason: ref.reason,
        createdBy: ref.createdBy,
      },
    });
  }

  /** Outflow with FEFO depletion. Stock may go negative (recorded, flagged as OUT). Returns cost. */
  async outflowInTx(
    tx: Tx,
    input: OutflowInput,
  ): Promise<{ cost: number; ingredient: Ingredient; after: number }> {
    const ing = await this.lockIngredient(tx, input.ingredientId);
    const batches = await tx.stockBatch.findMany({
      where: { ingredientId: ing.id, remainingQty: { gt: 0 } },
    });
    const { allocations, shortfall } = allocateFefo(
      batches.map((b) => ({
        id: b.id,
        remainingQty: Number(b.remainingQty),
        unitCost: Number(b.unitCost),
        expiresAt: b.expiresAt,
        receivedAt: b.receivedAt,
      })),
      input.quantity,
    );
    for (const a of allocations) {
      await tx.stockBatch.update({
        where: { id: a.batchId },
        data: { remainingQty: { decrement: a.quantity } },
      });
    }
    const cost = round2(
      allocations.reduce((s, a) => s + a.quantity * a.unitCost, 0) +
        shortfall * Number(ing.avgUnitCost),
    );
    const before = Number(ing.currentStock);
    const after = round3(before - input.quantity);
    await tx.ingredient.update({ where: { id: ing.id }, data: { currentStock: after } });
    await tx.stockMovement.create({
      data: {
        tenantId: ing.tenantId,
        outletId: ing.outletId,
        ingredientId: ing.id,
        type: input.type,
        quantity: -input.quantity,
        unitCost: input.quantity ? round2(cost / input.quantity) : 0,
        totalCost: cost,
        balanceAfter: after,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reason: input.reason,
        createdBy: input.createdBy,
      },
    });
    if (input.type === 'CONSUMPTION' || input.type === 'WASTAGE') {
      const date = dateOnly(istDate());
      const consumed = input.type === 'CONSUMPTION' ? input.quantity : 0;
      const wasted = input.type === 'WASTAGE' ? input.quantity : 0;
      await tx.consumptionDaily.upsert({
        where: { ingredientId_date: { ingredientId: ing.id, date } },
        create: {
          tenantId: ing.tenantId,
          outletId: ing.outletId,
          ingredientId: ing.id,
          date,
          consumedQty: consumed,
          wastedQty: wasted,
          ordersCount: consumed ? 1 : 0,
        },
        update: {
          consumedQty: { increment: consumed },
          wastedQty: { increment: wasted },
          ordersCount: { increment: consumed ? 1 : 0 },
        },
      });
    }
    if (
      crossedReorderLevel(before, after, Number(ing.reorderLevel)) ||
      (before > 0 && after <= 0)
    ) {
      await this.emitLow(tx, {
        ...ing,
        currentStock: after as unknown as Ingredient['currentStock'],
      });
    }
    if (shortfall > 0)
      this.logger.warn(`Ingredient ${ing.name} (${ing.id}) short by ${shortfall} ${ing.unit}`);
    return { cost, ingredient: ing, after };
  }

  async emitLow(tx: Tx, ing: Ingredient) {
    await this.outbox.enqueue<StockLowEvent>(tx, {
      stream: 'inventory',
      type: EventTypes.StockLow,
      aggregateType: 'Ingredient',
      aggregateId: ing.id,
      tenantId: ing.tenantId,
      data: {
        tenantId: ing.tenantId,
        outletId: ing.outletId,
        ingredientId: ing.id,
        ingredientName: ing.name,
        category: ing.category,
        unit: ing.unit,
        currentStock: String(ing.currentStock),
        reorderLevel: String(ing.reorderLevel),
        reorderQty: String(ing.reorderQty),
        marketplaceCategory: ing.marketplaceCategory,
      },
    });
  }

  // ─── API operations ────────────────────────────────────────────────────────
  async receive(tenantId: string, userId: string, dto: ReceiveStockDto) {
    return this.prisma.$transaction(async (tx) => {
      const movements = [];
      for (const line of dto.lines) {
        movements.push(
          await this.receiveInTx(
            tx,
            tenantId,
            { ...line, expiresAt: line.expiresAt ? new Date(line.expiresAt) : null },
            {
              type: 'PURCHASE',
              referenceType: dto.purchaseOrderId ? 'PURCHASE_ORDER' : 'MANUAL_GRN',
              referenceId: dto.purchaseOrderId,
              supplierTenantId: dto.supplierTenantId,
              createdBy: userId,
              reason: dto.note,
            },
          ),
        );
      }
      return { received: movements.length, movements };
    });
  }

  /** Physical count: books the variance as ADJUSTMENT and re-bases batches. */
  async adjust(tenantId: string, userId: string, dto: AdjustStockDto) {
    return this.prisma.$transaction(async (tx) => {
      const ing = await this.lockIngredient(tx, dto.ingredientId);
      if (ing.tenantId !== tenantId) throw notFound('Ingredient', dto.ingredientId);
      const variance = round3(dto.countedQuantity - Number(ing.currentStock));
      if (variance === 0) return { variance: 0 };
      if (variance < 0) {
        await this.outflowInTx(tx, {
          ingredientId: ing.id,
          quantity: -variance,
          type: 'ADJUSTMENT',
          referenceType: 'STOCK_COUNT',
          reason: `Count variance: ${dto.reason}`,
          createdBy: userId,
        });
      } else {
        await this.receiveInTx(
          tx,
          tenantId,
          { ingredientId: ing.id, quantity: variance, unitCost: Number(ing.avgUnitCost) },
          {
            type: 'ADJUSTMENT',
            referenceType: 'STOCK_COUNT',
            createdBy: userId,
            reason: dto.reason,
          },
        );
      }
      return { variance, countedQuantity: dto.countedQuantity };
    });
  }

  async wastage(tenantId: string, userId: string, dto: WastageDto) {
    const ing = await this.prisma
      .forTenant(tenantId)
      .ingredient.findUnique({ where: { id: dto.ingredientId } });
    if (!ing) throw notFound('Ingredient', dto.ingredientId);
    if (dto.quantity > Number(ing.currentStock))
      throw badRequest('Wastage exceeds stock on hand', 'WASTAGE_EXCEEDS_STOCK');
    return this.prisma.$transaction((tx) =>
      this.outflowInTx(tx, {
        ingredientId: ing.id,
        quantity: dto.quantity,
        type: 'WASTAGE',
        reason: dto.reason,
        createdBy: userId,
      }),
    );
  }

  async movements(tenantId: string, q: MovementsQueryDto) {
    const range = resolveIstRange(q, 30);
    const { page, pageSize, skip, take } = normalizePage({ page: q.page, pageSize: 50 });
    const where: Prisma.StockMovementWhereInput = {
      ingredientId: q.ingredientId,
      outletId: q.outletId,
      type: q.type,
      createdAt: { gte: range.from, lte: range.to },
    };
    const db = this.prisma.forTenant(tenantId);
    const [rows, total] = await Promise.all([
      db.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { ingredient: { select: { name: true, unit: true } } },
      }),
      db.stockMovement.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }
}
