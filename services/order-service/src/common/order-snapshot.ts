import type { Order, OrderItem, Outlet } from '@foodgrid/database';
import type { AddressSnapshot, OrderSnapshot } from '@foodgrid/types';
import { toMoney } from './money';

const s = (v: Parameters<typeof toMoney>[0] | null | undefined) =>
  v == null ? '0.00' : toMoney(v);

/** Builds the event payload shared by every order.* domain event. */
export function toOrderSnapshot(
  order: Order & { items: OrderItem[] },
  outlet: Pick<Outlet, 'name' | 'type' | 'city' | 'lat' | 'lng' | 'addressLine1' | 'phone'>,
  extra: { isFirstOrder?: boolean } = {},
): OrderSnapshot {
  const discount = Number(order.couponDiscount) + Number(order.membershipDiscount);
  const merchantDiscount =
    order.couponFundedBy === 'MERCHANT'
      ? Number(order.couponDiscount)
      : order.couponFundedBy === 'SHARED'
        ? Number(order.couponDiscount) / 2
        : 0;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    tenantId: order.tenantId,
    outletId: order.outletId,
    outletName: outlet.name,
    outletType: outlet.type,
    outletCity: outlet.city,
    outletLat: outlet.lat,
    outletLng: outlet.lng,
    outletAddress: outlet.addressLine1,
    outletPhone: outlet.phone,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    channel: order.channel,
    type: order.type,
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotal: s(order.subtotal),
    discount: toMoney(discount),
    deliveryFee: s(order.deliveryFee),
    platformFee: s(order.platformFee),
    packagingCharge: s(order.packagingCharge),
    taxTotal: s(order.taxTotal),
    tip: s(order.tip),
    total: s(order.total),
    couponFundedBy: order.couponFundedBy,
    merchantDiscount: toMoney(merchantDiscount),
    commissionRate: order.commissionRate ? s(order.commissionRate) : null,
    commissionAmount: order.commissionAmount ? s(order.commissionAmount) : null,
    deliveryAddress: (order.deliveryAddress as AddressSnapshot | null) ?? null,
    distanceKm: order.distanceKm,
    items: order.items.map((i) => ({
      menuItemId: i.menuItemId,
      name: i.name,
      quantity: i.quantity,
      unitPrice: s(i.unitPrice),
      totalPrice: s(i.totalPrice),
    })),
    placedAt: order.placedAt?.toISOString() ?? null,
    isFirstOrder: extra.isFirstOrder,
    deliveryOtp: order.deliveryOtp,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
  };
}
