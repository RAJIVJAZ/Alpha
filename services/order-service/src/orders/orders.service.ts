import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import type { AccessTokenClaims, OrderTrackingView } from '@foodgrid/types';
import { conflict, forbidden, normalizePage, notFound, paginate } from '@foodgrid/utils';
import { InternalHttpService, resolveRange } from '@foodgrid/utils/server';
import { CartService } from '../cart/cart.service';
import { outletScope } from '../common/outlet-access';
import { CUSTOMER_CANCELLABLE } from '../domain/order-state';
import { ListOrdersDto, MerchantOrdersQueryDto } from './dto/order.dto';
import { OrderLifecycleService } from './order-lifecycle.service';

interface DeliveryInfo {
  status: string;
  rider: { id: string; name: string; phone: string; lat: number | null; lng: number | null } | null;
  etaMins: number | null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly cart: CartService,
    private readonly internal: InternalHttpService,
  ) {}

  // ─── customer ──────────────────────────────────────────────────────────────
  async listForCustomer(userId: string, q: ListOrdersDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.OrderWhereInput = { customerId: userId, ...(q.status?.length ? { status: { in: q.status } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          outlet: { select: { name: true, slug: true, coverImageUrl: true } },
          items: { select: { name: true, quantity: true } },
          review: { select: { rating: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  async getForCustomer(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, events: { orderBy: { createdAt: 'asc' } }, outlet: { select: { name: true, slug: true, phone: true, lat: true, lng: true, addressLine1: true } }, review: true },
    });
    if (!order || order.customerId !== userId) throw notFound('Order', id);
    return order;
  }

  async track(userId: string, id: string): Promise<OrderTrackingView> {
    const order = await this.getForCustomer(userId, id);
    let delivery: DeliveryInfo | null = null;
    if (order.type === 'DELIVERY' && ['ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.status)) {
      delivery = await this.internal
        .get<DeliveryInfo>('delivery', `internal/deliveries/by-order/${id}`, { timeoutMs: 800 })
        .catch(() => null);
    }
    const etaMins = order.estimatedDeliveryAt
      ? Math.max(0, Math.round((order.estimatedDeliveryAt.getTime() - Date.now()) / 60_000))
      : null;
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryStatus: (delivery?.status as OrderTrackingView['deliveryStatus']) ?? null,
      timeline: order.events.map((e) => ({ status: e.toStatus, at: e.createdAt.toISOString(), note: e.note })),
      rider: delivery?.rider ?? null,
      outlet: { name: order.outlet.name, lat: order.outlet.lat, lng: order.outlet.lng },
      drop: (order.deliveryAddress as OrderTrackingView['drop']) ?? null,
      etaMins: delivery?.etaMins ?? etaMins,
      deliveryOtp: ['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.status) ? order.deliveryOtp : null,
    };
  }

  async cancelByCustomer(userId: string, id: string, reason: string) {
    const order = await this.getForCustomer(userId, id);
    if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
      throw conflict('This order can no longer be cancelled from the app. Please contact support.', 'CANCEL_NOT_ALLOWED');
    }
    return this.lifecycle.transition(id, 'CANCELLED', { actorType: 'CUSTOMER', actorId: userId, note: reason });
  }

  /** Re-adds the still-available items of a past order to the cart. */
  async reorder(userId: string, id: string) {
    const order = await this.getForCustomer(userId, id);
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: order.items.map((i) => i.menuItemId) }, isAvailable: true },
      include: { variants: true, addonGroups: { include: { addons: true } } },
    });
    const available = new Map(items.map((i) => [i.id, i]));
    const lines = order.items
      .filter((i) => available.has(i.menuItemId))
      .map((i) => {
        const item = available.get(i.menuItemId)!;
        const validAddonIds = new Set(item.addonGroups.flatMap((g) => g.addons.filter((a) => a.isAvailable).map((a) => a.id)));
        return {
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          variantId: i.variantId && item.variants.some((v) => v.id === i.variantId && v.isAvailable) ? i.variantId : undefined,
          addonIds: (i.addons as { id: string }[]).map((a) => a.id).filter((a) => validAddonIds.has(a)),
          notes: i.notes ?? undefined,
        };
      });
    if (!lines.length) throw conflict('None of these items are available right now', 'REORDER_UNAVAILABLE');
    await this.cart.replaceWith(userId, order.outletId, lines);
    return {
      added: lines.length,
      skipped: order.items.filter((i) => !available.has(i.menuItemId)).map((i) => i.name),
    };
  }

  // ─── merchant ──────────────────────────────────────────────────────────────
  async listForMerchant(user: AccessTokenClaims, q: MerchantOrdersQueryDto) {
    const { page, pageSize, skip, take } = normalizePage(q, 200);
    const range = q.from || q.to ? resolveRange(q) : null;
    const where: Prisma.OrderWhereInput = {
      ...outletScope(user, q.outletId),
      ...(q.status?.length ? { status: { in: q.status } } : { status: { not: 'PENDING_PAYMENT' } }),
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
      ...(q.q ? { orderNumber: { contains: q.q.toUpperCase() } } : {}),
    };
    const db = this.prisma.forTenant(user.tenantId!);
    const [rows, total, counts] = await Promise.all([
      db.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { items: true, outlet: { select: { name: true } } } }),
      db.order.count({ where }),
      db.order.groupBy({
        by: ['status'],
        where: { ...outletScope(user, q.outletId), createdAt: { gte: new Date(Date.now() - 86_400_000) } },
        _count: { _all: true },
      }),
    ]);
    return {
      ...paginate(rows, total, page, pageSize),
      statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    };
  }

  async getForMerchant(user: AccessTokenClaims, id: string) {
    const order = await this.prisma.forTenant(user.tenantId!).order.findUnique({
      where: { id },
      include: { items: true, events: { orderBy: { createdAt: 'asc' } }, kitchenTickets: true, outlet: { select: { name: true } } },
    });
    if (!order) throw notFound('Order', id);
    outletScope(user, order.outletId);
    return order;
  }

  async merchantAccept(user: AccessTokenClaims, id: string, prepTimeMins?: number) {
    const order = await this.getForMerchant(user, id);
    const outlet = await this.prisma.outlet.findUniqueOrThrow({ where: { id: order.outletId } });
    const prep = prepTimeMins ?? outlet.avgPrepTimeMins;
    const readyAt = new Date(Date.now() + prep * 60_000);
    return this.lifecycle.transition(id, 'ACCEPTED', {
      actorType: 'MERCHANT',
      actorId: user.sub,
      data: {
        estimatedReadyAt: readyAt,
        ...(order.type === 'DELIVERY' && order.estimatedDeliveryAt && order.estimatedDeliveryAt < readyAt
          ? { estimatedDeliveryAt: new Date(readyAt.getTime() + 15 * 60_000) }
          : {}),
      },
    });
  }

  async merchantTransition(user: AccessTokenClaims, id: string, to: 'REJECTED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED', note?: string) {
    const order = await this.getForMerchant(user, id);
    if (to === 'COMPLETED' && order.type === 'DELIVERY') {
      throw forbidden('Delivery orders complete when the rider delivers them', 'DELIVERY_ORDER');
    }
    if ((to === 'REJECTED' || to === 'CANCELLED') && !note) throw conflict('A reason is required', 'REASON_REQUIRED');
    return this.lifecycle.transition(id, to, { actorType: 'MERCHANT', actorId: user.sub, note });
  }
}
