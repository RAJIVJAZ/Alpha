import { Injectable } from '@nestjs/common';
import {
  ApprovalDecidedEvent,
  B2bOrderEvent,
  DeliveryEvent,
  EventEnvelope,
  EventTypes,
  IncentiveAchievedEvent,
  OrderStatusChangedEvent,
  PaymentEvent,
  PurchaseOrderEvent,
  RefundProcessedEvent,
  StockLowEvent,
  UserRegisteredEvent,
} from '@foodgrid/types';
import { OnDomainEvent } from '@foodgrid/utils/server';
import { NotificationsService } from '../notifications/notifications.service';

const MERCHANT_ORDER_ROLES = ['OWNER', 'MANAGER', 'CASHIER'];
const MERCHANT_STOCK_ROLES = ['OWNER', 'MANAGER', 'PROCUREMENT_MANAGER', 'CHEF'];

/** Translates domain events into customer, merchant, rider and supplier notifications. */
@Injectable()
export class NotificationEventHandlers {
  constructor(private readonly n: NotificationsService) {}

  private customer(o: OrderStatusChangedEvent, templateKey: string, data: Record<string, unknown> = {}) {
    if (!o.customerId) return Promise.resolve([]);
    return this.n.send({
      channel: 'PUSH',
      app: 'CUSTOMER',
      userId: o.customerId,
      templateKey,
      data: { orderId: o.orderId, orderNumber: o.orderNumber, outletName: o.outletName, ...data, deepLink: `foodgrid://orders/${o.orderId}` },
    });
  }

  @OnDomainEvent(EventTypes.OrderPlaced)
  async placed(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    const o = env.data;
    await this.n.toTenant(o.tenantId, MERCHANT_ORDER_ROLES, {
      channel: 'PUSH',
      templateKey: 'order.placed.merchant',
      data: { orderId: o.orderId, orderNumber: o.orderNumber, itemsCount: o.items.reduce((s, i) => s + i.quantity, 0), total: o.total, channel: 'orders' },
    });
    if (o.customerId) await this.n.send({ channel: 'IN_APP', userId: o.customerId, templateKey: 'order.placed.customer', data: { outletName: o.outletName } });
  }

  @OnDomainEvent(EventTypes.OrderAccepted)
  accepted(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    return env.data.channel === 'POS' ? undefined : this.customer(env.data, 'order.accepted');
  }

  @OnDomainEvent(EventTypes.OrderReady)
  ready(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    return env.data.type === 'TAKEAWAY' ? this.customer(env.data, 'order.ready.takeaway') : undefined;
  }

  @OnDomainEvent(EventTypes.OrderPickedUp)
  pickedUp(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    return this.customer(env.data, 'order.picked_up', { otp: env.data.deliveryOtp ?? '' });
  }

  @OnDomainEvent(EventTypes.OrderDelivered)
  delivered(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    return this.customer(env.data, 'order.delivered');
  }

  @OnDomainEvent(EventTypes.OrderCancelled, EventTypes.OrderRejected)
  cancelled(env: EventEnvelope<string, OrderStatusChangedEvent>) {
    const refundNote = env.data.paymentMethod && env.data.paymentMethod !== 'COD' && env.data.placedAt ? 'Any amount paid will be refunded.' : '';
    return this.customer(env.data, env.type === EventTypes.OrderRejected ? 'order.rejected' : 'order.cancelled', { refundNote });
  }

  @OnDomainEvent(EventTypes.DeliveryAssigned)
  assigned(env: EventEnvelope<string, DeliveryEvent>) {
    const d = env.data;
    if (!d.customerId) return;
    return this.n.send({ channel: 'PUSH', app: 'CUSTOMER', userId: d.customerId, templateKey: 'delivery.assigned', data: { riderName: d.riderName ?? 'Your rider', orderId: d.orderId } });
  }

  @OnDomainEvent(EventTypes.IncentiveAchieved)
  incentive(env: EventEnvelope<string, IncentiveAchievedEvent>) {
    return this.n.send({ channel: 'PUSH', app: 'RIDER', userId: env.data.userId, templateKey: 'rider.incentive', data: { reward: env.data.rewardAmount, scheme: env.data.schemeName } });
  }

  @OnDomainEvent(EventTypes.PaymentFailed)
  paymentFailed(env: EventEnvelope<string, PaymentEvent>) {
    if (env.data.purpose !== 'ORDER' || !env.data.userId) return;
    return this.n.send({ channel: 'PUSH', app: 'CUSTOMER', userId: env.data.userId, templateKey: 'payment.failed', data: { referenceShort: env.data.referenceId.slice(-6) } });
  }

  @OnDomainEvent(EventTypes.RefundProcessed)
  async refund(env: EventEnvelope<string, RefundProcessedEvent>) {
    // the refund event carries no user id; payment-service events for ORDER refunds are matched via inbox on the payment
    return env;
  }

  @OnDomainEvent(EventTypes.StockLow)
  stockLow(env: EventEnvelope<string, StockLowEvent>) {
    const s = env.data;
    return this.n.toTenant(s.tenantId, MERCHANT_STOCK_ROLES, {
      channel: 'PUSH',
      templateKey: 'inventory.low',
      data: { ingredient: s.ingredientName, stock: Number(s.currentStock).toFixed(1), unit: s.unit, ingredientId: s.ingredientId, channel: 'inventory' },
    });
  }

  @OnDomainEvent(EventTypes.PurchaseOrderSubmitted)
  poApproval(env: EventEnvelope<string, PurchaseOrderEvent>) {
    const p = env.data;
    return this.n.toTenant(p.tenantId, ['OWNER'], { channel: 'PUSH', templateKey: 'procurement.po.approval', data: { poNumber: p.poNumber, supplier: p.supplierTenantId, total: p.total, purchaseOrderId: p.purchaseOrderId } });
  }

  @OnDomainEvent(EventTypes.PurchaseOrderApproved)
  poToSupplier(env: EventEnvelope<string, PurchaseOrderEvent>) {
    const p = env.data;
    return this.n.toTenant(p.supplierTenantId, ['OWNER', 'MANAGER'], { channel: 'PUSH', templateKey: 'procurement.po.received_by_supplier', data: { poNumber: p.poNumber, buyer: p.buyerName, total: p.total } });
  }

  @OnDomainEvent(EventTypes.B2bOrderConfirmed, EventTypes.B2bOrderRejected, EventTypes.B2bOrderDispatched, EventTypes.B2bOrderDelivered)
  b2b(env: EventEnvelope<string, B2bOrderEvent>) {
    const b = env.data;
    return this.n.toTenant(b.buyerTenantId, ['OWNER', 'MANAGER', 'PROCUREMENT_MANAGER'], {
      channel: 'PUSH',
      templateKey: 'marketplace.order.update',
      data: { orderNumber: b.orderNumber || 'PO', status: b.status.replace('_', ' ').toLowerCase(), note: b.note ?? '' },
    });
  }

  @OnDomainEvent(EventTypes.ApprovalDecided)
  async approval(env: EventEnvelope<string, ApprovalDecidedEvent>) {
    const a = env.data;
    if (!a.submittedBy) return;
    const data = { entity: a.entityType.toLowerCase().replace('_', ' '), decision: a.decision.toLowerCase().replace('_', ' '), notes: a.notes ?? '' };
    await this.n.send({ channel: 'PUSH', userId: a.submittedBy, app: a.entityType === 'RIDER' ? 'RIDER' : 'MERCHANT', templateKey: 'approval.decided', data });
    await this.n.send({ channel: 'EMAIL', userId: a.submittedBy, templateKey: 'approval.decided', data });
  }

  @OnDomainEvent(EventTypes.UserRegistered)
  welcome(env: EventEnvelope<string, UserRegisteredEvent>) {
    return this.n.send({ channel: 'IN_APP', userId: env.data.userId, templateKey: 'user.welcome' });
  }
}
