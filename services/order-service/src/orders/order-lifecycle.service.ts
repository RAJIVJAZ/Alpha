import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { ActorType, Order, OrderItem, Outlet, Prisma } from '@foodgrid/database';
import { EventTypes, OrderStatus, OrderStatusChangedEvent } from '@foodgrid/types';
import { notFound } from '@foodgrid/utils';
import { businessCounter, OutboxService } from '@foodgrid/utils/server';
import { toOrderSnapshot } from '../common/order-snapshot';
import { orderStateMachine, STATUS_TIMESTAMP } from '../domain/order-state';
import { KdsService } from '../kds/kds.service';

type Tx = Prisma.TransactionClient;
export type OrderWithItems = Order & { items: OrderItem[]; outlet: Outlet };

const EVENT_FOR_STATUS: Partial<Record<OrderStatus, string>> = {
  PLACED: EventTypes.OrderPlaced,
  ACCEPTED: EventTypes.OrderAccepted,
  PREPARING: EventTypes.OrderPreparing,
  READY: EventTypes.OrderReady,
  PICKED_UP: EventTypes.OrderPickedUp,
  OUT_FOR_DELIVERY: EventTypes.OrderPickedUp,
  DELIVERED: EventTypes.OrderDelivered,
  COMPLETED: EventTypes.OrderCompleted,
  CANCELLED: EventTypes.OrderCancelled,
  REJECTED: EventTypes.OrderRejected,
};

const ordersTransitioned = businessCounter('orders_status_transitions_total', 'Order status transitions', ['to', 'channel']);

export interface TransitionOptions {
  actorType: ActorType;
  actorId?: string | null;
  note?: string | null;
  data?: Prisma.OrderUpdateInput;
  /** Skip the outbox event (callers that emit their own). */
  silent?: boolean;
}

/**
 * The single place where order status changes happen: validates the
 * transition, stamps timestamps, appends the timeline event, creates KDS
 * tickets on acceptance and publishes the domain event via the outbox.
 */
@Injectable()
export class OrderLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly kds: KdsService,
  ) {}

  async transition(orderId: string, to: OrderStatus, opts: TransitionOptions): Promise<OrderWithItems> {
    return this.prisma.$transaction((tx) => this.transitionInTx(tx, orderId, to, opts));
  }

  async transitionInTx(tx: Tx, orderId: string, to: OrderStatus, opts: TransitionOptions): Promise<OrderWithItems> {
    // Row lock prevents two concurrent transitions (e.g. merchant accept vs customer cancel).
    await tx.$queryRaw`SELECT id FROM "commerce"."Order" WHERE id = ${orderId} FOR UPDATE`;
    const current = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, outlet: true } });
    if (!current) throw notFound('Order', orderId);
    if (current.status === to) return current;
    orderStateMachine.assert(current.status, to);

    const now = new Date();
    const stamp = STATUS_TIMESTAMP[to];
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        ...opts.data,
        status: to,
        ...(stamp ? { [stamp]: now } : {}),
        ...(to === 'CANCELLED' || to === 'REJECTED'
          ? { cancelledBy: opts.actorType, cancelReason: opts.note ?? undefined }
          : {}),
        events: {
          create: { fromStatus: current.status, toStatus: to, actorType: opts.actorType, actorId: opts.actorId, note: opts.note },
        },
      },
      include: { items: true, outlet: true },
    });

    if (to === 'ACCEPTED') await this.kds.createTickets(tx, updated);
    if (to === 'CANCELLED' || to === 'REJECTED') {
      await this.kds.cancelTickets(tx, orderId);
      await this.releaseCoupon(tx, updated);
    }

    if (!opts.silent) await this.emit(tx, updated, current.status, opts.note);
    ordersTransitioned.inc({ to, channel: updated.channel });
    return updated;
  }

  async emit(tx: Tx, order: OrderWithItems, previous: OrderStatus | null, reason?: string | null, typeOverride?: string) {
    const type = typeOverride ?? EVENT_FOR_STATUS[order.status];
    if (!type) return;
    const minutes = (a?: Date | null, b?: Date | null) => (a && b ? Math.round((b.getTime() - a.getTime()) / 60000) : null);
    await this.outbox.enqueue<OrderStatusChangedEvent>(tx, {
      stream: 'order',
      type,
      aggregateType: 'Order',
      aggregateId: order.id,
      tenantId: order.tenantId,
      data: {
        ...toOrderSnapshot(order, order.outlet),
        previousStatus: previous,
        reason: reason ?? null,
        riderId: order.riderId,
        prepMins: minutes(order.acceptedAt, order.readyAt),
        deliveryMins: minutes(order.placedAt, order.deliveredAt ?? order.completedAt),
      },
    });
  }

  private async releaseCoupon(tx: Tx, order: Order) {
    if (!order.couponCode || !order.customerId) return;
    const redemption = await tx.couponRedemption.findUnique({ where: { orderId: order.id } });
    if (!redemption) return;
    await tx.couponRedemption.delete({ where: { id: redemption.id } });
    await tx.coupon.update({ where: { id: redemption.couponId }, data: { usedCount: { decrement: 1 } } });
  }
}
