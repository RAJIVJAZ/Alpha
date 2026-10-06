import type {
  B2bOrderStatus,
  OrderChannel,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentPurpose,
  PurchaseOrderStatus,
} from './enums';
import type { AddressSnapshot, Money } from './api';

/**
 * Domain events are published through each service's transactional outbox to
 * Redis Streams (`events:<stream>`) and consumed with consumer groups
 * (at-least-once; consumers de-duplicate on `id`).
 */
export interface EventEnvelope<TType extends string = string, TData = unknown> {
  id: string;
  type: TType;
  source: string;
  stream: EventStream;
  occurredAt: string;
  tenantId?: string | null;
  aggregateType: string;
  aggregateId: string;
  data: TData;
  version: 1;
}

export const EVENT_STREAMS = [
  'identity',
  'order',
  'payment',
  'delivery',
  'inventory',
  'procurement',
  'marketplace',
  'ads',
] as const;
export type EventStream = (typeof EVENT_STREAMS)[number];

export const streamKey = (stream: EventStream) => `events:${stream}`;

// ─── identity ────────────────────────────────────────────────────────────────
export interface UserRegisteredEvent {
  userId: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  referredBy: string | null;
}
export interface TenantStatusChangedEvent {
  tenantId: string;
  tenantType: string;
  status: string;
  reason?: string | null;
}
export interface RiderStatusChangedEvent {
  riderId: string;
  userId: string;
  status: string;
}
export interface ApprovalDecidedEvent {
  approvalId: string;
  entityType: 'TENANT' | 'OUTLET' | 'RIDER' | 'PRODUCT' | 'AD_CAMPAIGN';
  entityId: string;
  tenantId: string | null;
  decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  notes: string | null;
  reviewedBy: string;
  submittedBy: string | null;
}

// ─── order ───────────────────────────────────────────────────────────────────
export interface OrderLineSnapshot {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: Money;
  totalPrice: Money;
}

export interface OrderSnapshot {
  orderId: string;
  orderNumber: string;
  tenantId: string;
  outletId: string;
  outletName: string;
  outletType: string;
  outletCity: string;
  outletLat: number;
  outletLng: number;
  outletAddress: string;
  outletPhone: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  channel: OrderChannel;
  type: OrderType;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  subtotal: Money;
  discount: Money;
  deliveryFee: Money;
  platformFee: Money;
  packagingCharge: Money;
  taxTotal: Money;
  tip: Money;
  total: Money;
  couponFundedBy: string | null;
  merchantDiscount: Money;
  commissionRate: Money | null;
  deliveryAddress: AddressSnapshot | null;
  distanceKm: number | null;
  items: OrderLineSnapshot[];
  placedAt: string | null;
  isFirstOrder?: boolean;
  /** Handover OTP (internal consumers only; never exposed to merchants). */
  deliveryOtp?: string | null;
  estimatedReadyAt?: string | null;
}

export interface OrderStatusChangedEvent extends OrderSnapshot {
  previousStatus: OrderStatus | null;
  reason?: string | null;
  riderId?: string | null;
  prepMins?: number | null;
  deliveryMins?: number | null;
  /** Minutes from placing to the delivery time the customer was promised (delivery orders). */
  promisedMins?: number | null;
}

export interface ReviewCreatedEvent {
  reviewId: string;
  orderId: string;
  outletId: string;
  tenantId: string;
  riderId: string | null;
  rating: number;
  deliveryRating: number | null;
}

// ─── payment ─────────────────────────────────────────────────────────────────
export interface PaymentEvent {
  paymentId: string;
  purpose: PaymentPurpose;
  referenceId: string;
  userId: string | null;
  tenantId: string | null;
  amount: Money;
  method: PaymentMethod | null;
  reason?: string | null;
}

export interface RefundProcessedEvent {
  refundId: string;
  paymentId: string;
  purpose: PaymentPurpose;
  referenceId: string;
  amount: Money;
  toWallet: boolean;
}

// ─── delivery ────────────────────────────────────────────────────────────────
export interface DeliveryEvent {
  deliveryId: string;
  orderId: string;
  orderNumber: string;
  tenantId: string;
  outletId: string;
  customerId: string | null;
  riderId: string | null;
  /** identity user id of the rider (wallet owner). */
  riderUserId?: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  status: string;
  distanceKm: number;
  riderEarning: Money;
  tipAmount: Money;
  isCod: boolean;
  codAmount: Money;
  occurredAt: string;
  deliveryMins?: number | null;
}

export interface IncentiveAchievedEvent {
  riderIncentiveId: string;
  riderId: string;
  userId: string;
  schemeName: string;
  rewardAmount: Money;
}

// ─── inventory ───────────────────────────────────────────────────────────────
export interface StockLowEvent {
  tenantId: string;
  outletId: string;
  ingredientId: string;
  ingredientName: string;
  category: string;
  unit: string;
  currentStock: string;
  reorderLevel: string;
  reorderQty: string;
  marketplaceCategory: string | null;
}

export interface StockConsumedEvent {
  tenantId: string;
  outletId: string;
  orderId: string;
  lines: { ingredientId: string; quantity: string; cost: string }[];
  foodCost: Money;
}

// ─── procurement ─────────────────────────────────────────────────────────────
export interface PurchaseOrderLine {
  ingredientId: string | null;
  productId: string | null;
  name: string;
  sku: string | null;
  quantity: string;
  unit: string;
  unitPrice: Money;
  gstRate: string;
}

export interface PurchaseOrderEvent {
  purchaseOrderId: string;
  poNumber: string;
  tenantId: string;
  buyerName: string;
  outletId: string;
  supplierTenantId: string;
  status: PurchaseOrderStatus;
  total: Money;
  paymentTerms: string;
  expectedDeliveryAt: string | null;
  deliveryAddress: AddressSnapshot | null;
  items: PurchaseOrderLine[];
  notes?: string | null;
}

export interface PurchaseOrderReceivedEvent {
  purchaseOrderId: string;
  poNumber: string;
  tenantId: string;
  outletId: string;
  supplierTenantId: string;
  lines: { ingredientId: string; receivedQty: string; unitPrice: Money; unit: string }[];
}

// ─── marketplace ─────────────────────────────────────────────────────────────
export interface B2bOrderEvent {
  b2bOrderId: string;
  orderNumber: string;
  buyerTenantId: string;
  sellerTenantId: string;
  sourcePurchaseOrderId: string | null;
  status: B2bOrderStatus;
  subtotal?: Money;
  discount?: Money;
  taxTotal?: Money;
  deliveryCharge?: Money;
  isInterState?: boolean;
  paymentTerms?: string;
  total: Money;
  note?: string | null;
  expectedDeliveryAt?: string | null;
  trackingInfo?: Record<string, unknown> | null;
  confirmedLines?: { productId: string; confirmedQty: string }[];
  onTime?: boolean;
}

/** Canonical event type names. */
export const EventTypes = {
  UserRegistered: 'identity.user.registered',
  TenantStatusChanged: 'identity.tenant.status_changed',
  RiderStatusChanged: 'identity.rider.status_changed',
  ApprovalDecided: 'identity.approval.decided',

  OrderCreated: 'order.created',
  OrderPlaced: 'order.placed',
  OrderAccepted: 'order.accepted',
  OrderPreparing: 'order.preparing',
  OrderReady: 'order.ready',
  OrderPickedUp: 'order.picked_up',
  OrderDelivered: 'order.delivered',
  OrderCompleted: 'order.completed',
  OrderCancelled: 'order.cancelled',
  OrderRejected: 'order.rejected',
  ReviewCreated: 'order.review.created',

  PaymentCaptured: 'payment.captured',
  PaymentFailed: 'payment.failed',
  RefundProcessed: 'payment.refund.processed',

  DeliveryAssigned: 'delivery.assigned',
  DeliveryPickedUp: 'delivery.picked_up',
  DeliveryDelivered: 'delivery.delivered',
  DeliveryFailed: 'delivery.failed',
  IncentiveAchieved: 'delivery.incentive.achieved',

  StockLow: 'inventory.stock.low',
  StockConsumed: 'inventory.stock.consumed',

  PurchaseOrderSubmitted: 'procurement.po.submitted',
  PurchaseOrderApproved: 'procurement.po.approved',
  PurchaseOrderRejected: 'procurement.po.rejected',
  PurchaseOrderCancelled: 'procurement.po.cancelled',
  PurchaseOrderReceived: 'procurement.po.received',

  B2bOrderPlaced: 'marketplace.order.placed',
  B2bOrderConfirmed: 'marketplace.order.confirmed',
  B2bOrderRejected: 'marketplace.order.rejected',
  B2bOrderDispatched: 'marketplace.order.dispatched',
  B2bOrderInTransit: 'marketplace.order.in_transit',
  B2bOrderDelivered: 'marketplace.order.delivered',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
