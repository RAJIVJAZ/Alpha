import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import {
  ApprovalDecidedEvent,
  EventEnvelope,
  EventTypes,
  OrderStatusChangedEvent,
  ReviewCreatedEvent,
} from '@foodgrid/types';
import { OnDomainEvent } from '@foodgrid/utils/server';
import { DispatchService } from '../dispatch/dispatch.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class DeliveryEventHandlers {
  private readonly logger = new Logger(DeliveryEventHandlers.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: DispatchService,
    private readonly gateway: TrackingGateway,
  ) {}

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
    await this.prisma.delivery.update({ where: { id: d.id }, data: { readyAt: new Date() } });
    if (d.riderId)
      this.gateway.toRider(d.riderId, 'order:ready', {
        deliveryId: d.id,
        orderNumber: d.orderNumber,
      });
    else await this.dispatch.dispatch(d.id);
  }

  @OnDomainEvent(EventTypes.OrderCancelled, EventTypes.OrderRejected)
  async onCancelled(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    const d = await this.prisma.delivery.findUnique({ where: { orderId: env.data.orderId } });
    if (!d || ['DELIVERED', 'FAILED', 'CANCELLED'].includes(d.status)) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: d.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
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
    });
    if (d.riderId)
      this.gateway.toRider(d.riderId, 'delivery:cancelled', {
        deliveryId: d.id,
        orderNumber: d.orderNumber,
      });
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
