import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Delivery } from '@foodgrid/database';
import {
  ApprovalDecidedEvent,
  DeliveryEvent,
  EventEnvelope,
  EventTypes,
  OrderStatusChangedEvent,
  ReviewCreatedEvent,
} from '@foodgrid/types';
import { enumLabel } from '@foodgrid/utils';
import { OnDomainEvent, OutboxService } from '@foodgrid/utils/server';
import { toDeliveryEvent } from '../common/delivery-event';
import { DispatchService } from '../dispatch/dispatch.service';
import { RiderPayService, total } from '../pricing/rider-pay.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class DeliveryEventHandlers {
  private readonly logger = new Logger(DeliveryEventHandlers.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: DispatchService,
    private readonly gateway: TrackingGateway,
    private readonly pay: RiderPayService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Live feed for merchant dashboards subscribed to the outlet. Declared first so
   * a failing dispatch handler for the same event can't hold the push back.
   */
  @OnDomainEvent(
    EventTypes.OrderPlaced,
    EventTypes.OrderAccepted,
    EventTypes.OrderPreparing,
    EventTypes.OrderReady,
    EventTypes.OrderPickedUp,
    EventTypes.OrderDelivered,
    EventTypes.OrderCompleted,
    EventTypes.OrderCancelled,
    EventTypes.OrderRejected,
  )
  async onOrderForOutlet(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    // picked field by field: the snapshot also carries customer phone and delivery OTP
    const { orderId, orderNumber, outletId, status, total, placedAt } = env.data;
    if (!placedAt) return; // unpaid orders never reached the kitchen
    if (env.type === EventTypes.OrderPlaced)
      this.gateway.toOutlet(outletId, 'order:new', {
        orderId,
        orderNumber,
        outletId,
        status,
        total,
        placedAt,
      });
    else
      this.gateway.toOutlet(outletId, 'order:status', { orderId, orderNumber, outletId, status });
  }

  /** Dispatch starts when the kitchen accepts, so the rider arrives as food is ready. */
  @OnDomainEvent(EventTypes.OrderAccepted)
  async onAccepted(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    const d = await this.dispatch.createFromOrder(env.data);
    if (d) this.logger.log(`Delivery ${d.id} created for ${env.data.orderNumber}`);
  }

  @OnDomainEvent(EventTypes.OrderReady)
  async onReady(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    const d = await this.prisma.delivery.findUnique({ where: { orderId: env.data.orderId } });
    if (!d) return;
    const now = new Date();
    await this.prisma.delivery.update({
      where: { id: d.id },
      data: { readyAt: now, orderReadyAt: d.orderReadyAt ?? now },
    });
    if (d.riderId)
      this.gateway.toRider(d.riderId, 'order:ready', {
        deliveryId: d.id,
        orderNumber: d.orderNumber,
      });
    else await this.dispatch.dispatch(d.id);
  }

  /**
   * The order was cancelled or rejected: the delivery ends here. A rider who had reached the
   * pickup is paid the cancellation pay and any waiting pay (credited from delivery.cancelled).
   */
  @OnDomainEvent(EventTypes.OrderCancelled, EventTypes.OrderRejected)
  async onCancelled(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    // the rider may move the delivery on (e.g. pick up) while this runs: retry from the new status
    for (let attempt = 0; attempt < 5; attempt++) {
      const d = await this.prisma.delivery.findUnique({ where: { orderId: env.data.orderId } });
      if (!d || ['DELIVERED', 'FAILED', 'CANCELLED'].includes(d.status)) return;
      if (await this.cancelDelivery(d)) return;
    }
    // the consumer retries the event later
    throw new Error(`Delivery for ${env.data.orderNumber} kept changing while being cancelled`);
  }

  /** Cancels the delivery from the status read; false when it changed meanwhile. */
  private async cancelDelivery(d: Delivery): Promise<boolean> {
    const rider = d.riderId
      ? await this.prisma.riderProfile.findUnique({ where: { id: d.riderId } })
      : null;
    const now = new Date();
    const ended = await this.prisma.$transaction(async (tx) => {
      // only from the status read, so a redelivered event cannot pay twice
      const { count } = await tx.delivery.updateMany({
        where: { id: d.id, status: d.status },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      if (!count) return null;
      const wait = await this.pay.closeWait(tx, d, 'CANCELLED', now);
      const lines = await this.pay.endedEarly(tx, d, wait);
      const cancelled = await tx.delivery.update({
        where: { id: d.id },
        data: { riderEarning: total(lines) },
      });
      if (d.riderId) await this.pay.record(tx, cancelled, d.riderId, now, lines);
      await tx.deliveryOffer.updateMany({
        where: { deliveryId: d.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      if (d.riderId) {
        const remaining = await tx.delivery.count({
          where: {
            riderId: d.riderId,
            status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'] },
          },
        });
        await tx.riderProfile.update({
          where: { id: d.riderId },
          data: { isOnDelivery: remaining > 0 },
        });
      }
      await this.outbox.enqueue<DeliveryEvent>(tx, {
        stream: 'delivery',
        type: EventTypes.DeliveryCancelled,
        aggregateType: 'Delivery',
        aggregateId: d.id,
        tenantId: d.tenantId,
        data: toDeliveryEvent(cancelled, rider),
      });
      return cancelled;
    });
    if (!ended) return false;
    if (d.riderId)
      this.gateway.toRider(d.riderId, 'delivery:cancelled', {
        deliveryId: d.id,
        orderNumber: d.orderNumber,
      });
    return true;
  }

  @OnDomainEvent(EventTypes.ApprovalDecided)
  async onApproval(env: EventEnvelope<string, ApprovalDecidedEvent>) {
    if (env.data.entityType !== 'RIDER') return;
    const status =
      env.data.decision === 'APPROVED'
        ? 'ACTIVE'
        : env.data.decision === 'REJECTED'
          ? 'REJECTED'
          : 'PENDING_APPROVAL';
    await this.prisma.riderProfile.updateMany({
      where: { id: env.data.entityId },
      data: {
        status,
        // with changes requested the rider stays pending and may resubmit (RidersService.onboard)
        rejectionReason:
          env.data.decision === 'APPROVED'
            ? null
            : (env.data.notes ?? enumLabel(env.data.decision)),
        ...(status === 'ACTIVE' ? { approvedAt: new Date(), approvedBy: env.data.reviewedBy } : {}),
      },
    });
  }

  /** Delivery ratings feed the rider's running average. */
  @OnDomainEvent(EventTypes.ReviewCreated)
  async onReview(env: EventEnvelope<string, ReviewCreatedEvent>) {
    const { riderId, deliveryRating } = env.data;
    if (!riderId || !deliveryRating) return;
    await this.prisma.$executeRaw`
      UPDATE "delivery"."RiderProfile"
      SET rating = (rating * "ratingCount" + ${deliveryRating}) / ("ratingCount" + 1), "ratingCount" = "ratingCount" + 1
      WHERE id = ${riderId}`;
  }
}
