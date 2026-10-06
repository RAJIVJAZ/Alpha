import type { Delivery, RiderProfile } from '@foodgrid/database';
import type { DeliveryEvent } from '@foodgrid/types';

const m = (v: { toString(): string } | null | undefined) => Number(v?.toString() ?? 0).toFixed(2);

export function toDeliveryEvent(d: Delivery, rider: Pick<RiderProfile, 'id' | 'userId' | 'name' | 'phone'> | null): DeliveryEvent {
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
    tipAmount: m(d.tipAmount),
    isCod: d.isCod,
    codAmount: m(d.codAmount),
    occurredAt: new Date().toISOString(),
    deliveryMins: d.deliveredAt ? Math.round((d.deliveredAt.getTime() - d.createdAt.getTime()) / 60_000) : null,
  };
}
