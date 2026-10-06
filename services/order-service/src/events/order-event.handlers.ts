import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import {
  ApprovalDecidedEvent,
  DeliveryEvent,
  EventEnvelope,
  EventTypes,
  PaymentEvent,
  RefundProcessedEvent,
  TenantStatusChangedEvent,
} from '@foodgrid/types';
import { OnDomainEvent } from '@foodgrid/utils/server';
import { MembershipsService } from '../memberships/memberships.service';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';

/** Reacts to payment, delivery and identity events that affect orders. */
@Injectable()
export class OrderEventHandlers {
  private readonly logger = new Logger(OrderEventHandlers.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly memberships: MembershipsService,
  ) {}

  @OnDomainEvent(EventTypes.PaymentCaptured)
  async onPaymentCaptured(env: EventEnvelope<string, PaymentEvent>) {
    const p = env.data;
    switch (p.purpose) {
      case 'ORDER':
        return this.orderPaid(p);
      case 'MEMBERSHIP':
        await this.memberships.activate(p.referenceId, p.paymentId);
        return;
      case 'MEAL_SUBSCRIPTION':
        await this.prisma.mealSubscription.updateMany({
          where: { id: p.referenceId, status: 'PENDING_PAYMENT' },
          data: { status: 'ACTIVE', paymentId: p.paymentId },
        });
        return;
      default:
        return;
    }
  }

  private async orderPaid(p: PaymentEvent) {
    const order = await this.prisma.order.findUnique({ where: { id: p.referenceId } });
    if (!order) return;
    if (order.status === 'PENDING_PAYMENT') {
      await this.lifecycle.transition(order.id, 'PLACED', {
        actorType: 'SYSTEM',
        note: 'Payment received',
        data: { paymentStatus: 'PAID', paymentId: p.paymentId, paymentMethod: p.method ?? order.paymentMethod },
      });
      return;
    }
    // Payment landed after the order was cancelled/rejected: mark paid and
    // re-announce the cancellation so payment-service issues the refund.
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'PAID', paymentId: p.paymentId },
        include: { items: true, outlet: true },
      });
      if (['CANCELLED', 'REJECTED'].includes(updated.status)) {
        await this.lifecycle.emit(tx, updated, updated.status, 'Payment received after cancellation');
      }
    });
  }

  @OnDomainEvent(EventTypes.PaymentFailed)
  async onPaymentFailed(env: EventEnvelope<string, PaymentEvent>) {
    if (env.data.purpose !== 'ORDER') return;
    await this.prisma.order.updateMany({
      where: { id: env.data.referenceId, status: 'PENDING_PAYMENT' },
      data: { paymentStatus: 'FAILED' },
    });
  }

  @OnDomainEvent(EventTypes.RefundProcessed)
  async onRefund(env: EventEnvelope<string, RefundProcessedEvent>) {
    if (env.data.purpose !== 'ORDER') return;
    const order = await this.prisma.order.findUnique({ where: { id: env.data.referenceId } });
    if (!order) return;
    const full = Number(env.data.amount) >= Number(order.total);
    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });
  }

  @OnDomainEvent(EventTypes.DeliveryAssigned)
  async onAssigned(env: EventEnvelope<string, DeliveryEvent>) {
    await this.prisma.order.updateMany({ where: { id: env.data.orderId }, data: { riderId: env.data.riderId } });
  }

  @OnDomainEvent(EventTypes.DeliveryPickedUp)
  async onPickedUp(env: EventEnvelope<string, DeliveryEvent>) {
    const order = await this.prisma.order.findUnique({ where: { id: env.data.orderId } });
    if (!order) return;
    if (['ACCEPTED', 'PREPARING'].includes(order.status)) {
      await this.lifecycle.transition(order.id, 'READY', { actorType: 'SYSTEM', note: 'Picked up by rider' });
    }
    if (['ACCEPTED', 'PREPARING', 'READY'].includes(order.status)) {
      await this.lifecycle.transition(order.id, 'OUT_FOR_DELIVERY', {
        actorType: 'RIDER',
        actorId: env.data.riderId,
        data: { pickedUpAt: new Date(env.data.occurredAt), riderId: env.data.riderId },
      });
    }
  }

  @OnDomainEvent(EventTypes.DeliveryDelivered)
  async onDelivered(env: EventEnvelope<string, DeliveryEvent>) {
    const order = await this.prisma.order.findUnique({ where: { id: env.data.orderId } });
    if (!order || order.status === 'DELIVERED') return;
    if (order.status === 'READY') {
      await this.lifecycle.transition(order.id, 'OUT_FOR_DELIVERY', { actorType: 'RIDER', actorId: env.data.riderId });
    }
    await this.lifecycle.transition(order.id, 'DELIVERED', {
      actorType: 'RIDER',
      actorId: env.data.riderId,
      data: order.paymentStatus === 'COD_PENDING' ? { paymentStatus: 'PAID' } : {},
    });
    if (order.mealSubscriptionId) {
      await this.prisma.mealSubscription.update({
        where: { id: order.mealSubscriptionId },
        data: { mealsDelivered: { increment: 1 } },
      });
    }
  }

  @OnDomainEvent(EventTypes.DeliveryFailed)
  async onDeliveryFailed(env: EventEnvelope<string, DeliveryEvent & { reason?: string }>) {
    const order = await this.prisma.order.findUnique({ where: { id: env.data.orderId } });
    if (!order || ['DELIVERED', 'CANCELLED', 'REJECTED', 'COMPLETED'].includes(order.status)) return;
    await this.lifecycle.transition(order.id, 'CANCELLED', {
      actorType: 'SYSTEM',
      note: env.data.reason ?? 'Delivery could not be completed',
    });
  }

  @OnDomainEvent(EventTypes.ApprovalDecided)
  async onApproval(env: EventEnvelope<string, ApprovalDecidedEvent>) {
    const a = env.data;
    if (a.entityType !== 'OUTLET') return;
    await this.prisma.outlet.updateMany({
      where: { id: a.entityId, status: 'PENDING_APPROVAL' },
      data: { status: a.decision === 'APPROVED' ? 'ACTIVE' : 'DRAFT' },
    });
    this.logger.log(`Outlet ${a.entityId} ${a.decision}`);
  }

  @OnDomainEvent(EventTypes.TenantStatusChanged)
  async onTenantStatus(env: EventEnvelope<string, TenantStatusChangedEvent>) {
    const t = env.data;
    if (t.status === 'SUSPENDED') {
      await this.prisma.outlet.updateMany({
        where: { tenantId: t.tenantId, status: { in: ['ACTIVE', 'PAUSED'] } },
        data: { status: 'SUSPENDED', isOpen: false },
      });
    } else if (t.status === 'ACTIVE') {
      await this.prisma.outlet.updateMany({ where: { tenantId: t.tenantId, status: 'SUSPENDED' }, data: { status: 'PAUSED' } });
    }
  }
}
