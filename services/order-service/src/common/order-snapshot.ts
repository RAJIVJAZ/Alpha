import type { Order, OrderItem, Outlet } from '@foodgrid/database';
import type { AddressSnapshot, OrderSnapshot } from '@foodgrid/types';

const s = (v: { toString(): string } | null | undefined) => (v == null ? '0.00' : Number(v.toString()).toFixed(2));

/** Builds the event payload shared by every order.* domain event. */
export function toOrderSnapshot(
  order: Order & { items: OrderItem[] },
  outlet: Pick<Outlet, 'name' | 'type' | 'city' | 'lat' | 'lng' | 'addressLine1' | 'phone'>,
  extra: { isFirstOrder?: boolean } = {},
): OrderSnapshot {
  const discount = Number(order.couponDiscount) + Number(order.membershipDiscount);
  const merchantDiscount = order.couponFundedBy === 'MERCHANT' ? Number(order.couponDiscount) : order.couponFundedBy === 'SHARED' ? Number(order.couponDiscount) / 2 : 0;
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
    discount: discount.toFixed(2),
    deliveryFee: s(order.deliveryFee),
    platformFee: s(order.platformFee),
    packagingCharge: s(order.packagingCharge),
    taxTotal: s(order.taxTotal),
    tip: s(order.tip),
    total: s(order.total),
    couponFundedBy: order.couponFundedBy,
    merchantDiscount: merchantDiscount.toFixed(2),
    commissionRate: order.commissionRate ? s(order.commissionRate) : null,
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
  };
}
