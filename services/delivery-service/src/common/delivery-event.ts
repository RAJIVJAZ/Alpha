import type { Delivery, RiderProfile } from '@foodgrid/database';
import type { DeliveryEvent } from '@foodgrid/types';

const m = (v: { toString(): string } | null | undefined) => Number(v?.toString() ?? 0).toFixed(2);

const ENDED = ['DELIVERED', 'FAILED', 'CANCELLED'];

/** `riderPay` overrides what the event pays (the outgoing rider's pay on a reassignment). */
export function toDeliveryEvent(
  d: Delivery,
  rider: Pick<RiderProfile, 'id' | 'userId' | 'name' | 'phone'> | null,
  riderPay?: number,
): DeliveryEvent {
  const pay = riderPay ?? (ENDED.includes(d.status) ? Number(d.riderEarning) : undefined);
  return {
    deliveryId: d.id,
    orderId: d.orderId,
    orderNumber: d.orderNumber,
    tenantId: d.tenantId,
    outletId: d.outletId,
    customerId: d.customerId,
    riderId: rider?.id ?? d.riderId,
    riderUserId: rider?.userId ?? null,
    riderName: rider?.name ?? null,
    riderPhone: rider?.phone ?? null,
    status: d.status,
    distanceKm: d.distanceKm,
    riderEarning: m(d.riderEarning),
    ...(pay !== undefined ? { riderPay: m(pay) } : {}),
    tipAmount: m(d.tipAmount),
    isCod: d.isCod,
    codAmount: m(d.codAmount),
    occurredAt: new Date().toISOString(),
    deliveryMins: d.deliveredAt
      ? Math.round((d.deliveredAt.getTime() - d.createdAt.getTime()) / 60_000)
      : null,
  };
}
