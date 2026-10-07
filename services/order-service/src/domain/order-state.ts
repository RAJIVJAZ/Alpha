import type { DeliveryStatus, OrderPaymentStatus, OrderStatus } from '@foodgrid/types';
import { StateMachine } from '@foodgrid/utils';

export const orderStateMachine = new StateMachine<OrderStatus>('Order', {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['PICKED_UP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  PICKED_UP: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
});

/** Statuses where the customer can still cancel without contacting support. */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ['PENDING_PAYMENT', 'PLACED'];

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];

export const TERMINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'];

const ENDED_DELIVERY_STATUSES: DeliveryStatus[] = ['DELIVERED', 'FAILED', 'CANCELLED'];

/**
 * Minutes until arrival for order tracking: the rider's live estimate when
 * there is one, else the promised delivery time. Null once nothing is on its
 * way any more (delivered, completed, cancelled, rejected, or the delivery or
 * payment failed), so clients stop showing a countdown.
 */
export function trackingEtaMins(
  order: {
    status: OrderStatus;
    paymentStatus: OrderPaymentStatus;
    estimatedDeliveryAt: Date | null;
  },
  delivery: { status: string; etaMins: number | null } | null,
  now = new Date(),
): number | null {
  if (TERMINAL_STATUSES.includes(order.status) || order.paymentStatus === 'FAILED') return null;
  if (delivery && ENDED_DELIVERY_STATUSES.includes(delivery.status as DeliveryStatus)) return null;
  if (delivery?.etaMins != null) return delivery.etaMins;
  return order.estimatedDeliveryAt
    ? Math.max(0, Math.round((order.estimatedDeliveryAt.getTime() - now.getTime()) / 60_000))
    : null;
}

/** Timestamp column to stamp when entering a status. */
export const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  PLACED: 'placedAt',
  ACCEPTED: 'acceptedAt',
  PREPARING: 'preparingAt',
  READY: 'readyAt',
  PICKED_UP: 'pickedUpAt',
  DELIVERED: 'deliveredAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
  REJECTED: 'cancelledAt',
};
