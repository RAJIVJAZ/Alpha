import type { OrderStatus } from '@foodgrid/types';
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
