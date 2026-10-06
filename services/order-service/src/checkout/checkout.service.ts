import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@foodgrid/database/nest';
import { generateDocumentNumber, Prisma } from '@foodgrid/database';
import type { Coupon, CustomerMembership, MembershipPlan, Outlet } from '@foodgrid/database';
import type { AddressSnapshot, PaymentMethod, PriceBreakdown } from '@foodgrid/types';
import { EventTypes } from '@foodgrid/types';
import {
  AppError,
  badRequest,
  conflict,
  estimateRoadKm,
  haversineKm,
  istParts,
  isWithinOpeningHours,
  money,
  OpeningWindow,
  unprocessable,
} from '@foodgrid/utils';
import { businessCounter, InternalHttpService, OutboxService } from '@foodgrid/utils/server';
import { CartService, HydratedCart } from '../cart/cart.service';
import { toOrderSnapshot } from '../common/order-snapshot';
import { checkCouponEligibility } from '../domain/coupons';
import { computePricing, fallbackDeliveryFee, MembershipBenefits, PricingResult } from '../domain/pricing';
import { CheckoutDto, QuoteDto } from '../orders/dto/order.dto';

export interface DeliveryQuote {
  serviceable: boolean;
  distanceKm: number;
  deliveryFee: number;
  etaMins: number;
  surgeMultiplier: number;
  zoneId?: string | null;
}

interface FraudResult {
  score: number;
  decision: 'ALLOW' | 'REVIEW' | 'BLOCK';
  reasons: string[];
}

const PLATFORM_FEE = Number(process.env.PLATFORM_FEE ?? 5);
const ordersPlaced = businessCounter('orders_created_total', 'Orders created at checkout', ['channel', 'payment_method']);

/**
 * Prices carts and converts them into orders. Shared by the cart quote
 * endpoint and checkout so that the customer pays exactly what was quoted.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly internal: InternalHttpService,
    private readonly outbox: OutboxService,
  ) {}

  async quote(userId: string, dto: QuoteDto) {
    const cart = await this.cart.hydrate(userId);
    if (!cart.outlet || !cart.lines.length) return { cart: this.cartView(cart, null), quote: null };
    const priced = await this.price(userId, cart, {
      orderType: dto.orderType,
      drop: dto.lat !== undefined && dto.lng !== undefined ? { lat: dto.lat, lng: dto.lng } : undefined,
      tip: dto.tip ?? 0,
      paymentMethod: dto.paymentMethod,
    });
    return {
      cart: this.cartView(cart, priced.breakdown),
      delivery: priced.delivery,
      coupon: priced.couponError ? { code: cart.couponCode, valid: false, reason: priced.couponError } : cart.couponCode ? { code: cart.couponCode, valid: true } : null,
      isMember: !!priced.membership,
    };
  }

  cartView(cart: HydratedCart, pricing: PriceBreakdown | null) {
    return {
      outletId: cart.outlet?.id ?? null,
      outletName: cart.outlet?.name ?? null,
      couponCode: cart.couponCode,
      removedItems: cart.removed,
      lines: cart.lines.map((l) => ({
        lineId: l.lineId,
        menuItemId: l.item.id,
        name: l.item.name,
        quantity: l.quantity,
        variantId: l.variant?.id,
        variant: l.variant?.name,
        addonIds: l.addons.map((a) => a.id),
        addons: l.addons.map((a) => a.name),
        unitPrice: money(l.unitPrice),
        totalPrice: money(l.unitPrice * l.quantity),
        isVeg: l.item.isVeg,
        notes: l.notes,
      })),
      pricing,
    };
  }

  async price(
    userId: string,
    cart: HydratedCart,
    opts: { orderType: 'DELIVERY' | 'TAKEAWAY'; drop?: { lat: number; lng: number }; tip: number; paymentMethod?: PaymentMethod },
  ) {
    const outlet = cart.outlet!;
    const delivery = opts.orderType === 'DELIVERY' && opts.drop ? await this.deliveryQuote(outlet, opts.drop) : null;
    const membership = await this.activeMembership(userId);
    const isFirstOrder = (await this.completedOrders(userId)) === 0;

    let coupon: Coupon | null = null;
    let couponError: string | undefined;
    if (cart.couponCode) {
      coupon = await this.prisma.coupon.findUnique({ where: { code: cart.couponCode } });
      if (!coupon) couponError = 'Invalid coupon code';
      else {
        const userRedemptions = await this.prisma.couponRedemption.count({ where: { couponId: coupon.id, userId } });
        const check = checkCouponEligibility(
          { ...coupon, value: Number(coupon.value), maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null, minOrderValue: Number(coupon.minOrderValue) },
          { now: new Date(), outletId: outlet.id, tenantId: outlet.tenantId, isFirstOrder, isMember: !!membership, userRedemptions, paymentMethod: opts.paymentMethod },
        );
        if (!check.valid) {
          couponError = check.reason;
          coupon = null;
        }
      }
    }

    const pricing = computePricing({
      lines: cart.lines.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity, unitPrice: l.unitPrice, gstRate: Number(l.item.gstRate) })),
      packagingCharge: Number(outlet.packagingCharge),
      deliveryFee: delivery?.deliveryFee ?? 0,
      platformFee: opts.orderType === 'DELIVERY' ? PLATFORM_FEE : 0,
      tip: opts.orderType === 'DELIVERY' ? opts.tip : 0,
      coupon: coupon && {
        code: coupon.code,
        type: coupon.type,
        value: Number(coupon.value),
        maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
        minOrderValue: Number(coupon.minOrderValue),
      },
      membership: membership ? (membership.plan.benefits as MembershipBenefits) : null,
      interState: false, // consumer deliveries stay within the outlet's delivery radius (same state)
    });
    if (couponError) pricing.messages.unshift(couponError);
    if (pricing.subtotal < Number(outlet.minOrderValue)) {
      pricing.messages.push(`Minimum order value is ₹${Number(outlet.minOrderValue)}`);
    }
    return { pricing, breakdown: toBreakdown(pricing), delivery, coupon, couponError, membership, isFirstOrder };
  }

  async deliveryQuote(outlet: Outlet, drop: { lat: number; lng: number }): Promise<DeliveryQuote> {
    try {
      return await this.internal.get<DeliveryQuote>('delivery', 'internal/delivery/quote', {
        query: { pickupLat: outlet.lat, pickupLng: outlet.lng, dropLat: drop.lat, dropLng: drop.lng, prepMins: outlet.avgPrepTimeMins },
        timeoutMs: 800,
        retries: 0,
      });
    } catch (err) {
      this.logger.warn(`delivery quote fallback: ${(err as Error).message}`);
      const distanceKm = Math.round(estimateRoadKm(outlet, drop) * 10) / 10;
      return {
        serviceable: distanceKm <= outlet.deliveryRadiusKm,
        distanceKm,
        deliveryFee: fallbackDeliveryFee(distanceKm),
        etaMins: outlet.avgPrepTimeMins + Math.round((distanceKm / 22) * 60) + 5,
        surgeMultiplier: 1,
      };
    }
  }

  private activeMembership(userId: string): Promise<(CustomerMembership & { plan: MembershipPlan }) | null> {
    return this.prisma.customerMembership.findFirst({
      where: { customerId: userId, status: 'ACTIVE', endsAt: { gt: new Date() } },
      include: { plan: true },
    });
  }

  private completedOrders(userId: string) {
    return this.prisma.order.count({ where: { customerId: userId, status: { in: ['DELIVERED', 'COMPLETED'] } } });
  }

  // ─── placing the order ────────────────────────────────────────────────────
  async placeOrder(user: { sub: string; name?: string; phone?: string }, dto: CheckoutDto, meta: { idempotencyKey?: string; ip?: string }) {
    const cart = await this.cart.hydrate(user.sub);
    if (!cart.outlet || !cart.lines.length) throw badRequest('Your cart is empty', 'CART_EMPTY');
    if (cart.removed.length) throw conflict(`Some items became unavailable: ${cart.removed.join(', ')}`, 'CART_CHANGED');
    const outlet = cart.outlet;
    this.assertOutletCanTakeOrder(outlet, dto);

    if (dto.orderType === 'DELIVERY' && !dto.deliveryAddress) throw badRequest('Delivery address is required', 'ADDRESS_REQUIRED');
    const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    if (scheduledFor) {
      const ahead = scheduledFor.getTime() - Date.now();
      if (ahead < 45 * 60_000 || ahead > 7 * 86_400_000) throw badRequest('Schedule between 45 minutes and 7 days ahead', 'INVALID_SCHEDULE');
    }

    const priced = await this.price(user.sub, cart, {
      orderType: dto.orderType,
      drop: dto.deliveryAddress,
      tip: dto.tip ?? 0,
      paymentMethod: dto.paymentMethod,
    });
    if (cart.couponCode && priced.couponError) throw unprocessable(priced.couponError, 'COUPON_INVALID');
    if (priced.pricing.subtotal < Number(outlet.minOrderValue)) {
      throw unprocessable(`Minimum order value is ₹${Number(outlet.minOrderValue)}`, 'BELOW_MIN_ORDER');
    }
    if (priced.delivery && !priced.delivery.serviceable) {
      throw unprocessable('This address is outside the delivery area', 'NOT_SERVICEABLE');
    }
    if (dto.paymentMethod === 'COD' && priced.pricing.total > 3000) {
      throw unprocessable('Cash on delivery is available for orders up to ₹3,000', 'COD_LIMIT');
    }

    const orderId = randomUUID();
    const fraud = await this.fraudCheck(orderId, user.sub, dto, priced.pricing, priced.coupon, priced.isFirstOrder);
    if (fraud?.decision === 'BLOCK') throw new AppError('ORDER_BLOCKED', 'We could not place this order. Please contact support.', 422);
    if (fraud?.decision === 'REVIEW' && dto.paymentMethod === 'COD') {
      throw unprocessable('Cash on delivery is not available for this order, please pay online', 'COD_UNAVAILABLE');
    }

    const isCod = dto.paymentMethod === 'COD';
    const p = priced.pricing;
    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await generateDocumentNumber(tx, 'ORD');
      const created = await tx.order.create({
        data: {
          id: orderId,
          orderNumber,
          tenantId: outlet.tenantId,
          outletId: outlet.id,
          customerId: user.sub,
          customerName: dto.deliveryAddress?.contactName ?? user.name,
          customerPhone: dto.deliveryAddress?.contactPhone ?? user.phone,
          channel: 'APP',
          type: dto.orderType,
          status: isCod ? 'PLACED' : 'PENDING_PAYMENT',
          paymentStatus: isCod ? 'COD_PENDING' : 'PENDING',
          paymentMethod: dto.paymentMethod,
          subtotal: p.subtotal,
          couponDiscount: p.couponDiscount,
          membershipDiscount: p.membershipDiscount,
          deliveryFee: p.deliveryFee,
          packagingCharge: p.packagingCharge,
          platformFee: p.platformFee,
          taxTotal: p.taxTotal,
          cgst: p.cgst,
          sgst: p.sgst,
          igst: p.igst,
          tip: p.tip,
          roundOff: p.roundOff,
          total: p.total,
          couponCode: priced.coupon?.code,
          couponFundedBy: priced.coupon?.fundedBy,
          deliveryAddress: (dto.deliveryAddress ?? undefined) as Prisma.InputJsonValue | undefined,
          deliveryLat: dto.deliveryAddress?.lat,
          deliveryLng: dto.deliveryAddress?.lng,
          distanceKm: priced.delivery?.distanceKm,
          deliveryOtp: dto.orderType === 'DELIVERY' ? String(Math.floor(1000 + Math.random() * 9000)) : null,
          specialInstructions: dto.specialInstructions,
          scheduledFor,
          estimatedDeliveryAt: priced.delivery ? new Date(Date.now() + priced.delivery.etaMins * 60_000) : null,
          placedAt: isCod ? new Date() : null,
          fraudScore: fraud?.score,
          idempotencyKey: meta.idempotencyKey ? `${user.sub}:${meta.idempotencyKey}` : undefined,
          deviceId: dto.deviceId,
          ipAddress: meta.ip,
          items: {
            create: cart.lines.map((l, i) => ({
              menuItemId: l.item.id,
              name: l.item.name,
              variantId: l.variant?.id,
              variant: l.variant?.name,
              addons: l.addons.map((a) => ({ id: a.id, name: a.name, price: Number(a.price).toFixed(2) })),
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              totalPrice: l.unitPrice * l.quantity,
              gstRate: l.item.gstRate,
              taxAmount: p.lineTax[i]?.tax ?? 0,
              isVeg: l.item.isVeg,
              notes: l.notes,
              kdsStation: l.item.kdsStation,
            })),
          },
          events: { create: { toStatus: isCod ? 'PLACED' : 'PENDING_PAYMENT', actorType: 'CUSTOMER', actorId: user.sub } },
        },
        include: { items: true, outlet: true },
      });

      if (priced.coupon) {
        const c = priced.coupon;
        const res = await tx.coupon.updateMany({
          where: { id: c.id, ...(c.usageLimit != null ? { usedCount: { lt: c.usageLimit } } : {}) },
          data: { usedCount: { increment: 1 } },
        });
        if (!res.count) throw conflict('Coupon usage limit reached', 'COUPON_EXHAUSTED');
        await tx.couponRedemption.create({ data: { couponId: c.id, userId: user.sub, orderId, discount: p.couponDiscount } });
      }
      if (priced.membership && p.savings > 0) {
        await tx.customerMembership.update({
          where: { id: priced.membership.id },
          data: { savings: { increment: p.membershipDiscount + (priced.coupon?.type === 'FREE_DELIVERY' ? 0 : p.deliveryFeeWaived) } },
        });
      }

      const snapshot = toOrderSnapshot(created, created.outlet, { isFirstOrder: priced.isFirstOrder });
      const base = { stream: 'order' as const, aggregateType: 'Order', aggregateId: created.id, tenantId: created.tenantId };
      await this.outbox.enqueue(tx, { ...base, type: EventTypes.OrderCreated, data: { ...snapshot, previousStatus: null } });
      if (isCod) await this.outbox.enqueue(tx, { ...base, type: EventTypes.OrderPlaced, data: { ...snapshot, previousStatus: 'PENDING_PAYMENT' } });
      return created;
    });

    await this.cart.clear(user.sub);
    ordersPlaced.inc({ channel: 'APP', payment_method: dto.paymentMethod });
    return {
      order: { id: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total, paymentStatus: order.paymentStatus },
      pricing: priced.breakdown,
      payment: isCod
        ? null
        : { required: true, purpose: 'ORDER', referenceId: order.id, amount: money(p.total), method: dto.paymentMethod },
    };
  }

  private assertOutletCanTakeOrder(outlet: Outlet, dto: CheckoutDto) {
    if (outlet.status !== 'ACTIVE') throw conflict('This outlet is not accepting orders', 'OUTLET_UNAVAILABLE');
    const open = outlet.isOpen && isWithinOpeningHours(outlet.openingHours as unknown as OpeningWindow[]);
    if (!open && !dto.scheduledFor) throw conflict(`${outlet.name} is closed right now`, 'OUTLET_CLOSED');
    if (dto.orderType === 'DELIVERY' && !outlet.acceptsDelivery) throw conflict('Delivery is not available', 'DELIVERY_UNAVAILABLE');
    if (dto.orderType === 'TAKEAWAY' && !outlet.acceptsTakeaway) throw conflict('Takeaway is not available', 'TAKEAWAY_UNAVAILABLE');
  }

  /** Fail-open risk scoring through ai-service. */
  private async fraudCheck(
    orderId: string,
    userId: string,
    dto: CheckoutDto,
    pricing: PricingResult,
    coupon: Coupon | null,
    isFirstOrder: boolean,
  ): Promise<FraudResult | null> {
    try {
      const since24h = new Date(Date.now() - 86_400_000);
      const since30d = new Date(Date.now() - 30 * 86_400_000);
      const [ordersLast24h, failedPayments24h, cancelled30d, history, deviceAccounts, user] = await Promise.all([
        this.prisma.order.count({ where: { customerId: userId, createdAt: { gte: since24h } } }),
        this.prisma.order.count({ where: { customerId: userId, paymentStatus: 'FAILED', createdAt: { gte: since24h } } }),
        this.prisma.order.count({ where: { customerId: userId, status: 'CANCELLED', cancelledBy: 'CUSTOMER', createdAt: { gte: since30d } } }),
        this.prisma.order.findMany({
          where: { customerId: userId, status: { in: ['DELIVERED', 'COMPLETED'] } },
          select: { total: true, deliveryLat: true, deliveryLng: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        dto.deviceId
          ? this.prisma.order.findMany({
              where: { deviceId: dto.deviceId, createdAt: { gte: since30d } },
              distinct: ['customerId'],
              select: { customerId: true },
            })
          : Promise.resolve([]),
        this.internal.get<{ createdAt: string }>('user', `internal/users/${userId}`, { timeoutMs: 400, retries: 0 }).catch(() => null),
      ]);
      const avgOrderValue = history.length ? history.reduce((s, h) => s + Number(h.total), 0) / history.length : null;
      const lastDrop = history.find((h) => h.deliveryLat != null);
      const features = {
        accountAgeDays: user ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86_400_000) : null,
        ordersLast24h,
        failedPaymentsLast24h: failedPayments24h,
        cancelledLast30d: cancelled30d,
        completedOrders: history.length,
        isFirstOrder,
        orderValue: pricing.total,
        avgOrderValue,
        isCod: dto.paymentMethod === 'COD',
        couponUsed: !!coupon,
        firstOrderCoupon: !!coupon?.firstOrderOnly,
        accountsOnDevice: deviceAccounts.length,
        addressDistanceFromUsualKm:
          lastDrop && dto.deliveryAddress
            ? haversineKm({ lat: lastDrop.deliveryLat!, lng: lastDrop.deliveryLng! }, dto.deliveryAddress)
            : null,
        hourOfDay: istParts().hour,
      };
      return await this.internal.post<FraudResult>(
        'ai',
        'internal/ai/fraud/score',
        { entityType: 'ORDER', entityId: orderId, userId, features },
        { timeoutMs: 800 },
      );
    } catch (err) {
      this.logger.warn(`fraud check skipped: ${(err as Error).message}`);
      return null;
    }
  }
}

export function toBreakdown(p: PricingResult): PriceBreakdown {
  return {
    subtotal: money(p.subtotal),
    couponDiscount: money(p.couponDiscount),
    membershipDiscount: money(p.membershipDiscount),
    deliveryFee: money(p.deliveryFee),
    packagingCharge: money(p.packagingCharge),
    platformFee: money(p.platformFee),
    cgst: money(p.cgst),
    sgst: money(p.sgst),
    igst: money(p.igst),
    taxTotal: money(p.taxTotal),
    tip: money(p.tip),
    roundOff: money(p.roundOff),
    total: money(p.total),
    savings: money(p.savings),
    messages: p.messages,
  };
}

export type { AddressSnapshot };
