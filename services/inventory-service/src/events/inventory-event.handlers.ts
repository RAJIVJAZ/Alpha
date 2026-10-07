import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import {
  EventEnvelope,
  EventTypes,
  OrderStatusChangedEvent,
  PurchaseOrderReceivedEvent,
  StockConsumedEvent,
} from '@foodgrid/types';
import { money, round2, Unit } from '@foodgrid/utils';
import { OnDomainEvent, OutboxService } from '@foodgrid/utils/server';
import { recipeRequirements } from '../domain/stock';
import { StockService } from '../stock/stock.service';

/**
 * - order.accepted: recipe-based ingredient consumption (theoretical usage).
 * - procurement.po.received: goods receipt into stock.
 */
@Injectable()
export class InventoryEventHandlers {
  private readonly logger = new Logger(InventoryEventHandlers.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly outbox: OutboxService,
  ) {}

  @OnDomainEvent(EventTypes.OrderAccepted)
  async consumeForOrder(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    const order = env.data;
    const already = await this.prisma.stockMovement.count({
      where: { referenceType: 'ORDER', referenceId: order.orderId },
    });
    if (already) return;

    const qtyByItem = new Map<string, number>();
    for (const line of order.items)
      qtyByItem.set(line.menuItemId, (qtyByItem.get(line.menuItemId) ?? 0) + line.quantity);
    const recipes = await this.prisma.recipe.findMany({
      where: {
        tenantId: order.tenantId,
        menuItemId: { in: [...qtyByItem.keys()] },
        isActive: true,
      },
      include: { lines: { include: { ingredient: true } } },
    });
    if (!recipes.length) return;

    const totals = new Map<string, number>();
    for (const recipe of recipes) {
      const units = new Map(recipe.lines.map((l) => [l.ingredientId, l.ingredient.unit as Unit]));
      const req = recipeRequirements(
        recipe.lines.map((l) => ({
          ingredientId: l.ingredientId,
          quantity: Number(l.quantity),
          unit: l.unit as Unit,
          wastagePct: Number(l.wastagePct),
        })),
        units,
        qtyByItem.get(recipe.menuItemId) ?? 0,
        Number(recipe.yieldQty),
      );
      for (const [id, q] of req) totals.set(id, (totals.get(id) ?? 0) + q);
    }

    await this.prisma.$transaction(async (tx) => {
      const lines: StockConsumedEvent['lines'] = [];
      // deterministic lock order avoids deadlocks between concurrent orders
      for (const ingredientId of [...totals.keys()].sort()) {
        const quantity = totals.get(ingredientId)!;
        if (quantity <= 0) continue;
        const res = await this.stock.outflowInTx(tx, {
          ingredientId,
          quantity,
          type: 'CONSUMPTION',
          referenceType: 'ORDER',
          referenceId: order.orderId,
          reason: `Order ${order.orderNumber}`,
        });
        lines.push({ ingredientId, quantity: String(quantity), cost: money(res.cost) });
      }
      await this.outbox.enqueue<StockConsumedEvent>(tx, {
        stream: 'inventory',
        type: EventTypes.StockConsumed,
        aggregateType: 'Order',
        aggregateId: order.orderId,
        tenantId: order.tenantId,
        data: {
          tenantId: order.tenantId,
          outletId: order.outletId,
          orderId: order.orderId,
          lines,
          foodCost: money(round2(lines.reduce((s, l) => s + Number(l.cost), 0))),
        },
      });
    });
  }

  @OnDomainEvent(EventTypes.PurchaseOrderReceived)
  async receivePurchaseOrder(env: EventEnvelope<string, PurchaseOrderReceivedEvent>) {
    const po = env.data;
    const already = await this.prisma.stockMovement.count({
      where: { referenceType: 'PURCHASE_ORDER', referenceId: po.purchaseOrderId },
    });
    if (already) return;
    await this.prisma.$transaction(async (tx) => {
      for (const line of po.lines) {
        if (Number(line.receivedQty) <= 0) continue;
        await this.stock.receiveInTx(
          tx,
          po.tenantId,
          {
            ingredientId: line.ingredientId,
            quantity: Number(line.receivedQty),
            unitCost: Number(line.unitPrice),
          },
          {
            type: 'PURCHASE',
            referenceType: 'PURCHASE_ORDER',
            referenceId: po.purchaseOrderId,
            supplierTenantId: po.supplierTenantId,
            reason: `PO ${po.poNumber}`,
          },
        );
      }
    });
    this.logger.log(`Received PO ${po.poNumber} into stock (${po.lines.length} lines)`);
  }
}
