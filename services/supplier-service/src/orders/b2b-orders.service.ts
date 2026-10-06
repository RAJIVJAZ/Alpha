import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { generateDocumentNumber, Prisma } from '@foodgrid/database';
import type { B2bOrder, B2bOrderItem, B2bOrderStatus, BuyerSegment, PaymentTerms } from '@foodgrid/database';
import { B2bOrderEvent, EventTypes } from '@foodgrid/types';
import { AppError, conflict, forbidden, isInterState, money, normalizePage, notFound, paginate, round2, StateMachine, unprocessable } from '@foodgrid/utils';
import { OutboxService } from '@foodgrid/utils/server';
import { TenantDirectory } from '../common/tenant-directory.service';
import { DealersService } from '../dealers/dealers.service';
import { computeB2bTotals, Segment, tierPrice, validateQuantity } from '../domain/b2b-pricing';
import { deliveryChargeFor, findZone, slotBookable } from '../domain/logistics';
import { stockStatusFor } from '../products/products.service';
import { ConfirmB2bOrderDto, DispatchDto, ListB2bOrdersDto, LocationDto, PlaceB2bOrderDto, RateSellerDto } from './dto/b2b-order.dto';

type Tx = Prisma.TransactionClient;
type OrderWithItems = B2bOrder & { items: B2bOrderItem[] };

export const b2bStateMachine = new StateMachine<B2bOrderStatus>('B2B order', {
  PLACED: ['CONFIRMED', 'PARTIALLY_CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'DISPATCHED', 'CANCELLED'],
  PARTIALLY_CONFIRMED: ['PACKED', 'DISPATCHED', 'CANCELLED'],
  PACKED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['IN_TRANSIT', 'DELIVERED'],
  IN_TRANSIT: ['IN_TRANSIT', 'DELIVERED'],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
});

const EVENT_BY_STATUS: Partial<Record<B2bOrderStatus, string>> = {
  PLACED: EventTypes.B2bOrderPlaced,
  CONFIRMED: EventTypes.B2bOrderConfirmed,
  PARTIALLY_CONFIRMED: EventTypes.B2bOrderConfirmed,
  REJECTED: EventTypes.B2bOrderRejected,
  CANCELLED: EventTypes.B2bOrderRejected,
  DISPATCHED: EventTypes.B2bOrderDispatched,
  IN_TRANSIT: EventTypes.B2bOrderInTransit,
  DELIVERED: EventTypes.B2bOrderDelivered,
};

export interface PlaceInput extends PlaceB2bOrderDto {
  buyerTenantId: string;
  buyerName?: string;
  sourcePurchaseOrderId?: string;
  /** Prices agreed on the purchase order (procurement); validated against the catalogue. */
  agreedPrices?: Map<string, number>;
}

/**
 * B2B order workflow between buyers (restaurants, carts, retailers,
 * wholesalers) and sellers: pricing with bulk tiers & dealer terms, MOQ,
 * stock, zone serviceability and slot capacity; supplier confirmation
 * (full/partial), dispatch and delivery tracking.
 */
@Injectable()
export class B2bOrdersService {
  private readonly logger = new Logger(B2bOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly tenants: TenantDirectory,
    private readonly dealers: DealersService,
  ) {}

  async place(input: PlaceInput) {
    if (input.buyerTenantId === input.sellerTenantId) throw conflict('You cannot order from yourself', 'SELF_ORDER');
    const [seller, buyer, dealer] = await Promise.all([
      this.tenants.get(input.sellerTenantId),
      this.tenants.get(input.buyerTenantId),
      this.dealers.termsFor(input.sellerTenantId, input.buyerTenantId),
    ]);
    if (seller.status !== 'ACTIVE') throw conflict('This seller is not accepting orders', 'SELLER_INACTIVE');

    const products = await this.prisma.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) }, tenantId: input.sellerTenantId },
      include: { priceTiers: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const segment: Segment = dealer ? 'DEALER' : buyer.type === 'RETAILER' || buyer.type === 'WHOLESALER' ? 'RETAILER' : 'RESTAURANT';
    const errors: string[] = [];
    const lines = input.items.map((i) => {
      const p = byId.get(i.productId);
      if (!p || !p.isActive) {
        errors.push(`Product ${i.productId} is unavailable`);
        return null;
      }
      const qtyError = validateQuantity(i.quantity, { moq: Number(p.moq), stepQty: Number(p.stepQty), maxOrderQty: p.maxOrderQty ? Number(p.maxOrderQty) : null });
      if (qtyError) errors.push(`${p.name}: ${qtyError}`);
      if (Number(p.stockQty) < i.quantity) errors.push(`${p.name}: only ${Number(p.stockQty)} in stock`);
      const catalogue = tierPrice(
        Number(p.price),
        p.priceTiers.map((t) => ({ ...t, minQty: Number(t.minQty), maxQty: t.maxQty ? Number(t.maxQty) : null, unitPrice: Number(t.unitPrice), segment: t.segment as Segment })),
        i.quantity,
        segment,
      );
      const agreed = input.agreedPrices?.get(p.id);
      return { product: p, quantity: i.quantity, unitPrice: agreed !== undefined ? Math.min(agreed, catalogue) : catalogue };
    });
    if (errors.length) throw unprocessable(errors.join('; '), 'ORDER_INVALID', errors);
    const valid = lines.filter((l): l is NonNullable<typeof l> => !!l);

    const zones = await this.prisma.sellerDeliveryZone.findMany({ where: { tenantId: input.sellerTenantId } });
    const zone = zones.length ? findZone(zones.map((z) => ({ ...z, deliveryCharge: Number(z.deliveryCharge), freeDeliveryAbove: z.freeDeliveryAbove ? Number(z.freeDeliveryAbove) : null, minOrderValue: Number(z.minOrderValue) })), input.deliveryAddress) : null;
    if (zones.length && !zone) throw unprocessable(`${seller.name} does not deliver to ${input.deliveryAddress.pincode}`, 'NOT_SERVICEABLE');
    const gross = valid.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    if (zone && gross < zone.minOrderValue) throw unprocessable(`Minimum order value for this area is ₹${zone.minOrderValue}`, 'BELOW_MIN_ORDER');

    let deliveryDate: Date | null = null;
    if (input.deliverySlotId) {
      if (!input.deliveryDate) throw unprocessable('deliveryDate is required with a slot', 'DATE_REQUIRED');
      const slot = await this.prisma.deliverySlot.findFirst({ where: { id: input.deliverySlotId, tenantId: input.sellerTenantId } });
      if (!slot) throw notFound('Delivery slot', input.deliverySlotId);
      const day = input.deliveryDate.slice(0, 10);
      deliveryDate = new Date(`${day}T00:00:00.000Z`);
      const booked = await this.prisma.b2bOrder.count({ where: { deliverySlotId: slot.id, deliveryDate, status: { notIn: ['CANCELLED', 'REJECTED'] } } });
      const check = slotBookable(slot, day, booked);
      if (!check.ok) throw unprocessable(check.reason!, 'SLOT_UNAVAILABLE');
    }

    const paymentTerms: PaymentTerms = input.paymentTerms ?? (dealer?.paymentTerms as PaymentTerms | undefined) ?? 'PREPAID';
    if (paymentTerms !== 'PREPAID' && paymentTerms !== 'COD') {
      if (!dealer) throw forbidden('Credit terms are available to registered dealers only', 'CREDIT_NOT_ALLOWED');
      const exposure = Number(dealer.outstanding) + gross;
      if (exposure > Number(dealer.creditLimit)) throw unprocessable('Credit limit exceeded', 'CREDIT_LIMIT');
    }

    const interState = isInterState(seller.stateCode, buyer.stateCode);
    const totals = computeB2bTotals(
      valid.map((l) => ({ productId: l.product.id, quantity: l.quantity, unitPrice: l.unitPrice, gstRate: Number(l.product.gstRate) })),
      { discountPct: dealer ? Number(dealer.discountPct) : 0, deliveryCharge: deliveryChargeFor(zone, gross), interState },
    );
    const leadHours = Math.max(zone?.leadTimeHours ?? 0, ...valid.map((l) => l.product.deliveryTimeHours));

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.b2bOrder.create({
        data: {
          orderNumber: await generateDocumentNumber(tx, 'SO'),
          buyerTenantId: input.buyerTenantId,
          buyerName: input.buyerName ?? buyer.name,
          sellerTenantId: input.sellerTenantId,
          sellerName: seller.name,
          sourcePurchaseOrderId: input.sourcePurchaseOrderId,
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxTotal: totals.taxTotal,
          deliveryCharge: totals.deliveryCharge,
          total: totals.total,
          paymentTerms,
          deliverySlotId: input.deliverySlotId,
          deliveryDate,
          deliveryAddress: input.deliveryAddress as unknown as Prisma.InputJsonValue,
          expectedDeliveryAt: new Date(Date.now() + leadHours * 3_600_000),
          notes: input.notes,
          items: {
            create: totals.lines.map((l, i) => ({
              productId: l.productId,
              name: valid[i]!.product.name,
              sku: valid[i]!.product.sku,
              quantity: l.quantity,
              unit: `${Number(valid[i]!.product.packSize)} ${valid[i]!.product.unit}`,
              unitPrice: l.unitPrice,
              gstRate: l.gstRate,
              taxAmount: l.tax,
              lineTotal: l.lineTotal,
            })),
          },
          events: { create: { status: 'PLACED', note: input.sourcePurchaseOrderId ? 'Created from purchase order' : null } },
        },
        include: { items: true },
      });
      await this.emit(tx, order, interState);
      return order;
    });
  }

  private async emit(tx: Tx, order: OrderWithItems, interState?: boolean, extra: Partial<B2bOrderEvent> = {}) {
    const type = EVENT_BY_STATUS[order.status];
    if (!type) return;
    await this.outbox.enqueue<B2bOrderEvent>(tx, {
      stream: 'marketplace',
      type,
      aggregateType: 'B2bOrder',
      aggregateId: order.id,
      tenantId: order.sellerTenantId,
      data: {
        b2bOrderId: order.id,
        orderNumber: order.orderNumber,
        buyerTenantId: order.buyerTenantId,
        sellerTenantId: order.sellerTenantId,
        sourcePurchaseOrderId: order.sourcePurchaseOrderId,
        status: order.status,
        subtotal: money(order.subtotal.toString()),
        discount: money(order.discount.toString()),
        taxTotal: money(order.taxTotal.toString()),
        deliveryCharge: money(order.deliveryCharge.toString()),
        isInterState: interState,
        paymentTerms: order.paymentTerms,
        total: money(order.total.toString()),
        expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
        trackingInfo: (order.trackingInfo as Record<string, unknown> | null) ?? null,
        ...extra,
      },
    });
  }

  private async transition(
    orderId: string,
    sellerTenantId: string | null,
    to: B2bOrderStatus,
    patch: Prisma.B2bOrderUpdateInput,
    note?: string | null,
    extra: Partial<B2bOrderEvent> = {},
    loc?: { lat: number; lng: number },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "marketplace"."B2bOrder" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.b2bOrder.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order || (sellerTenantId && order.sellerTenantId !== sellerTenantId)) throw notFound('B2B order', orderId);
      b2bStateMachine.assert(order.status, to);
      const updated = await tx.b2bOrder.update({
        where: { id: orderId },
        data: { ...patch, status: to, events: { create: { status: to, note, lat: loc?.lat, lng: loc?.lng } } },
        include: { items: true },
      });
      await this.emit(tx, updated, undefined, { note, ...extra });
      return { before: order, after: updated };
    });
  }

  // ─── seller actions ────────────────────────────────────────────────────────
  async confirm(sellerTenantId: string, id: string, dto: ConfirmB2bOrderDto) {
    const order = await this.prisma.b2bOrder.findFirst({ where: { id, sellerTenantId }, include: { items: true } });
    if (!order) throw notFound('B2B order', id);
    const confirmed = new Map(order.items.map((i) => [i.productId, Number(i.quantity)]));
    for (const l of dto.lines ?? []) {
      if (!confirmed.has(l.productId)) throw unprocessable(`Product ${l.productId} is not in this order`, 'INVALID_LINE');
      confirmed.set(l.productId, Math.min(l.confirmedQty, confirmed.get(l.productId)!));
    }
    const partial = order.items.some((i) => confirmed.get(i.productId)! < Number(i.quantity));
    if ([...confirmed.values()].every((q) => q === 0)) throw unprocessable('Nothing confirmed — reject the order instead', 'NOTHING_CONFIRMED');

    return this.prisma.$transaction(async (tx) => {
      // reserve stock atomically; fail if it moved since the order was placed
      for (const [productId, qty] of confirmed) {
        if (qty <= 0) continue;
        const res = await tx.product.updateMany({ where: { id: productId, stockQty: { gte: qty } }, data: { stockQty: { decrement: qty } } });
        if (!res.count) throw new AppError('INSUFFICIENT_STOCK', `Not enough stock to confirm ${productId}`, 409);
        const p = await tx.product.findUniqueOrThrow({ where: { id: productId } });
        await tx.product.update({ where: { id: productId }, data: { stockStatus: stockStatusFor(Number(p.stockQty), Number(p.lowStockThreshold)) } });
      }
      for (const item of order.items) {
        const qty = confirmed.get(item.productId)!;
        await tx.b2bOrderItem.update({
          where: { id: item.id },
          data: { confirmedQty: qty, lineTotal: Number(item.quantity) ? round2((Number(item.lineTotal) * qty) / Number(item.quantity)) : 0 },
        });
      }
      const items = await tx.b2bOrderItem.findMany({ where: { orderId: id } });
      const total = round2(items.reduce((s, i) => s + Number(i.lineTotal), 0) + Number(order.deliveryCharge) * 1.18);
      const status: B2bOrderStatus = partial ? 'PARTIALLY_CONFIRMED' : 'CONFIRMED';
      b2bStateMachine.assert(order.status, status);
      const updated = await tx.b2bOrder.update({
        where: { id },
        data: {
          status,
          total: partial ? total : order.total,
          confirmedAt: new Date(),
          expectedDeliveryAt: dto.expectedDeliveryAt ? new Date(dto.expectedDeliveryAt) : order.expectedDeliveryAt,
          events: { create: { status, note: dto.note } },
        },
        include: { items: true },
      });
      await this.emit(tx, updated, undefined, {
        note: dto.note,
        confirmedLines: [...confirmed.entries()].map(([productId, q]) => ({ productId, confirmedQty: String(q) })),
      });
      return updated;
    });
  }

  async reject(sellerTenantId: string, id: string, reason: string) {
    const { after } = await this.transition(id, sellerTenantId, 'REJECTED', { rejectionReason: reason }, reason);
    return after;
  }

  async pack(sellerTenantId: string, id: string) {
    return (await this.transition(id, sellerTenantId, 'PACKED', { packedAt: new Date() }, 'Packed')).after;
  }

  async dispatch(sellerTenantId: string, id: string, dto: DispatchDto) {
    const tracking = { ...dto };
    return (
      await this.transition(id, sellerTenantId, 'DISPATCHED', {
        dispatchedAt: new Date(),
        trackingInfo: tracking as Prisma.InputJsonValue,
        ...(dto.eta ? { expectedDeliveryAt: new Date(dto.eta) } : {}),
      }, `Dispatched${dto.vehicleNumber ? ` on ${dto.vehicleNumber}` : ''}`)
    ).after;
  }

  async location(sellerTenantId: string, id: string, dto: LocationDto) {
    const order = await this.prisma.b2bOrder.findFirst({ where: { id, sellerTenantId } });
    if (!order) throw notFound('B2B order', id);
    const tracking = { ...((order.trackingInfo as Record<string, unknown>) ?? {}), lat: dto.lat, lng: dto.lng, updatedAt: new Date().toISOString() };
    return (await this.transition(id, sellerTenantId, 'IN_TRANSIT', { trackingInfo: tracking as Prisma.InputJsonValue }, dto.note ?? 'Location update', {}, dto)).after;
  }

  async deliver(sellerTenantId: string, id: string) {
    const now = new Date();
    const order = await this.prisma.b2bOrder.findFirst({ where: { id, sellerTenantId }, include: { items: true } });
    if (!order) throw notFound('B2B order', id);
    const onTime = !order.expectedDeliveryAt || now <= order.expectedDeliveryAt;
    const { after } = await this.transition(id, sellerTenantId, 'DELIVERED', { deliveredAt: now }, onTime ? 'Delivered on time' : 'Delivered late', { onTime });
    await this.updateMetrics(after, onTime);
    return after;
  }

  /** Cancellation by the buyer (or a cancelled PO) before dispatch; restocks confirmed quantities. */
  async cancel(id: string, actor: { buyerTenantId?: string; reason: string }) {
    const order = await this.prisma.b2bOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order || (actor.buyerTenantId && order.buyerTenantId !== actor.buyerTenantId)) throw notFound('B2B order', id);
    const wasReserved = ['CONFIRMED', 'PARTIALLY_CONFIRMED', 'PACKED'].includes(order.status);
    const { after } = await this.transition(id, null, 'CANCELLED', { cancelledAt: new Date() }, actor.reason);
    if (wasReserved) {
      for (const i of order.items) {
        if (i.confirmedQty && Number(i.confirmedQty) > 0) {
          await this.prisma.product.update({ where: { id: i.productId }, data: { stockQty: { increment: Number(i.confirmedQty) } } });
        }
      }
    }
    return after;
  }

  private async updateMetrics(order: OrderWithItems, onTime: boolean) {
    const ordered = order.items.reduce((s, i) => s + Number(i.quantity), 0);
    const fulfilled = order.items.reduce((s, i) => s + Number(i.confirmedQty ?? i.quantity), 0);
    const fill = ordered ? fulfilled / ordered : 1;
    const leadHours = (Date.now() - order.createdAt.getTime()) / 3_600_000;
    const m = await this.prisma.sellerMetrics.findUnique({ where: { tenantId: order.sellerTenantId } });
    const n = (m?.totalOrders ?? 0) + 1;
    const ema = (prev: number, value: number) => prev + (value - prev) / Math.min(n, 50);
    await this.prisma.sellerMetrics.upsert({
      where: { tenantId: order.sellerTenantId },
      create: { tenantId: order.sellerTenantId, sellerName: order.sellerName, totalOrders: 1, onTimeRate: onTime ? 1 : 0, fillRate: fill, avgLeadTimeHours: leadHours },
      update: {
        totalOrders: n,
        onTimeRate: ema(m?.onTimeRate ?? 1, onTime ? 1 : 0),
        fillRate: ema(m?.fillRate ?? 1, fill),
        avgLeadTimeHours: ema(m?.avgLeadTimeHours ?? 24, leadHours),
      },
    });
  }

  async rate(buyerTenantId: string, id: string, dto: RateSellerDto) {
    const order = await this.prisma.b2bOrder.findFirst({ where: { id, buyerTenantId } });
    if (!order) throw notFound('B2B order', id);
    if (order.status !== 'DELIVERED') throw conflict('Rate after delivery', 'NOT_DELIVERED');
    const rating = await this.prisma.sellerRating.create({
      data: {
        b2bOrderId: id,
        buyerTenantId,
        sellerTenantId: order.sellerTenantId,
        rating: dto.rating,
        qualityRating: dto.qualityRating,
        onTime: dto.onTime ?? (!order.expectedDeliveryAt || !order.deliveredAt || order.deliveredAt <= order.expectedDeliveryAt),
        comment: dto.comment,
      },
    });
    const agg = await this.prisma.sellerRating.aggregate({ where: { sellerTenantId: order.sellerTenantId }, _avg: { rating: true }, _count: { _all: true } });
    await this.prisma.sellerMetrics.update({
      where: { tenantId: order.sellerTenantId },
      data: { avgRating: round2(agg._avg.rating ?? 0), ratingCount: agg._count._all },
    });
    await this.prisma.product.updateMany({
      where: { tenantId: order.sellerTenantId, id: { in: (await this.prisma.b2bOrderItem.findMany({ where: { orderId: id }, select: { productId: true } })).map((i) => i.productId) } },
      data: { rating: round2(agg._avg.rating ?? 0), ratingCount: agg._count._all },
    });
    return rating;
  }

  // ─── queries ───────────────────────────────────────────────────────────────
  async list(side: 'buyer' | 'seller', tenantId: string, q: ListB2bOrdersDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.B2bOrderWhereInput = {
      ...(side === 'buyer' ? { buyerTenantId: tenantId } : { sellerTenantId: tenantId }),
      ...(q.status?.length ? { status: { in: q.status } } : {}),
      ...(q.q ? { OR: [{ orderNumber: { contains: q.q.toUpperCase() } }, { buyerName: { contains: q.q, mode: 'insensitive' } }, { sellerName: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total, counts] = await Promise.all([
      this.prisma.b2bOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { items: true } }),
      this.prisma.b2bOrder.count({ where }),
      this.prisma.b2bOrder.groupBy({ by: ['status'], where: side === 'buyer' ? { buyerTenantId: tenantId } : { sellerTenantId: tenantId }, _count: { _all: true } }),
    ]);
    return { ...paginate(rows, total, page, pageSize), statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
  }

  async get(tenantId: string, id: string) {
    const order = await this.prisma.b2bOrder.findUnique({ where: { id }, include: { items: true, events: { orderBy: { createdAt: 'asc' } } } });
    if (!order || (order.buyerTenantId !== tenantId && order.sellerTenantId !== tenantId)) throw notFound('B2B order', id);
    return order;
  }
}
