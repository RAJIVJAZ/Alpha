import { randomBytes } from 'node:crypto';
import { computeGst, HANDOVER_BUFFER_MINS, istParts, travelMinutes } from './helpers';
import type { Prisma } from '../../generated/client';
import { istDateStamp } from '../../src/sequence';
import type { CustomerRef, OutletRef, RiderRef, SeedContext } from './context';
import { istWeekStart } from './delivery';
import { DEMO_CUSTOMER_PHONE } from './identity';
import type { InventoryResult } from './inventory';
import { addMinutes, atIst, id, inChunks, istDay, istMidnight, log, r2, Rng } from './lib';
import { buildOrder, ORDER_DAYS, type SimOrder, type Simulation } from './simulate';

/** The checkout ETA for delivery orders, as delivery-service quotes it: prep + riding + hand-over. */
const promisedMins = (o: SimOrder) =>
  o.type === 'DELIVERY'
    ? o.outlet.def.avgPrepTimeMins + travelMinutes(o.distanceKm ?? 3) + HANDOVER_BUFFER_MINS
    : null;

const REVIEW_COMMENTS: Record<number, string[]> = {
  5: [
    'Absolutely delicious, will order again!',
    'Hot, fresh and on time.',
    'Best in the area.',
    'Perfect packaging and great taste.',
    '',
  ],
  4: [
    'Tasty food, slightly late.',
    'Good portion size.',
    'Nice, but could be a little spicier.',
    '',
  ],
  3: ['Average, food was lukewarm.', 'Okay taste, packaging could be better.'],
  2: ['Too oily this time.', 'Order arrived late and cold.'],
  1: ['Wrong item delivered.', 'Very disappointed with the quality.'],
};
const REVIEW_TAGS: Record<number, string[]> = {
  5: ['tasty', 'great-packaging', 'on-time'],
  4: ['tasty', 'value-for-money'],
  3: ['average'],
  2: ['late', 'cold-food'],
  1: ['wrong-item', 'poor-quality'],
};

const pay = () => `pay_${randomBytes(7).toString('hex')}`;
const rzpOrder = () => `order_${randomBytes(7).toString('hex')}`;
const minutes = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000);

interface Ctx2 {
  orderRows: Prisma.OrderCreateManyInput[];
  itemRows: Prisma.OrderItemCreateManyInput[];
  eventRows: Prisma.OrderStatusEventCreateManyInput[];
  paymentRows: Prisma.PaymentCreateManyInput[];
  refundRows: Prisma.RefundCreateManyInput[];
  deliveryRows: Prisma.DeliveryCreateManyInput[];
  /** order id → seeded delivery (id, number, quoted pay without tip) */
  deliveries: Map<string, { id: string; orderNumber: string; earning: number }>;
  earningRows: (Prisma.RiderEarningCreateManyInput & { _day: string })[];
  reviewRows: Prisma.ReviewCreateManyInput[];
  redemptionRows: Prisma.CouponRedemptionCreateManyInput[];
  lineRows: Prisma.SettlementLineCreateManyInput[];
  invoiceRows: Prisma.GstInvoiceCreateManyInput[];
  factRows: Prisma.OrderFactCreateManyInput[];
  fraudRows: Prisma.FraudAssessmentCreateManyInput[];
  ticketRows: Prisma.KitchenTicketCreateManyInput[];
}

export async function seedOrders(ctx: SeedContext, sim: Simulation, inv: InventoryResult) {
  const rng = new Rng(777);
  const c: Ctx2 = {
    orderRows: [],
    itemRows: [],
    eventRows: [],
    paymentRows: [],
    refundRows: [],
    deliveryRows: [],
    deliveries: new Map(),
    earningRows: [],
    reviewRows: [],
    redemptionRows: [],
    lineRows: [],
    invoiceRows: [],
    factRows: [],
    fraudRows: [],
    ticketRows: [],
  };
  const demo = ctx.customers.find((x) => x.phone === DEMO_CUSTOMER_PHONE)!;
  const recent = sim.orders.filter((o) => o.daysAgo <= ORDER_DAYS);
  const walletOrders: { o: SimOrder; paymentId: string }[] = [];
  const membershipSavings = new Map<string, number>();

  for (const o of recent) {
    const orderNumber = ctx.docNumber('ORD', o.placedAt);
    const paymentId = addPayment(c, o);
    if (o.paymentMethod === 'WALLET') walletOrders.push({ o, paymentId: paymentId! });
    addOrderRows(ctx, c, o, orderNumber, paymentId, inv, rng);
    if (o.membershipDiscount > 0) {
      membershipSavings.set(
        o.customer!.userId,
        r2((membershipSavings.get(o.customer!.userId) ?? 0) + o.membershipDiscount),
      );
    }
  }

  const live = buildLiveOrders(ctx, rng, demo);
  for (const o of live) {
    const orderNumber = ctx.docNumber('ORD', o.placedAt);
    const paymentId = addPayment(c, o);
    addOrderRows(ctx, c, o, orderNumber, paymentId, inv, rng);
  }

  const { prisma } = ctx;
  await inChunks(c.orderRows, 1000, (x) => prisma.order.createMany({ data: x }));
  await inChunks(c.itemRows, 2000, (x) => prisma.orderItem.createMany({ data: x }));
  await inChunks(c.eventRows, 2000, (x) => prisma.orderStatusEvent.createMany({ data: x }));
  await inChunks(c.ticketRows, 1000, (x) => prisma.kitchenTicket.createMany({ data: x }));
  await inChunks(c.paymentRows, 2000, (x) => prisma.payment.createMany({ data: x }));
  await inChunks(c.refundRows, 2000, (x) => prisma.refund.createMany({ data: x }));
  await inChunks(c.deliveryRows, 1000, (x) => prisma.delivery.createMany({ data: x }));
  await inChunks(c.reviewRows, 2000, (x) => prisma.review.createMany({ data: x }));
  await inChunks(c.redemptionRows, 2000, (x) => prisma.couponRedemption.createMany({ data: x }));
  await inChunks(c.lineRows, 2000, (x) => prisma.settlementLine.createMany({ data: x }));
  await inChunks(c.invoiceRows, 2000, (x) => prisma.gstInvoice.createMany({ data: x }));
  await inChunks(c.factRows, 2000, (x) => prisma.orderFact.createMany({ data: x }));
  if (c.fraudRows.length) await prisma.fraudAssessment.createMany({ data: c.fraudRows });
  log(
    'orders',
    `${recent.length} historical (${ORDER_DAYS} days) + ${live.length} live, ${c.itemRows.length} items, ${c.deliveryRows.length} deliveries, ${c.reviewRows.length} reviews`,
  );
  log(
    'payments & tax',
    `${c.paymentRows.length} payments, ${c.refundRows.length} refunds, ${c.lineRows.length} settlement lines, ${c.invoiceRows.length} GST invoices`,
  );

  for (const [code, coupon] of ctx.coupons) {
    const used = c.redemptionRows.filter((r) => r.couponId === coupon.id).length;
    if (used) await prisma.coupon.update({ where: { code }, data: { usedCount: used } });
  }
  for (const [userId, savings] of membershipSavings) {
    await prisma.customerMembership.updateMany({
      where: { customerId: userId, status: 'ACTIVE' },
      data: { savings },
    });
  }
  await updateOutletRatings(ctx, c);
  await seedCustomerWallets(ctx, walletOrders, demo);
  await seedRiderLedger(ctx, [...recent, ...live], c, rng);
}

// ─── payments ────────────────────────────────────────────────────────────────

function addPayment(c: Ctx2, o: SimOrder): string | null {
  if (o.channel === 'POS') return null;
  const ok =
    o.status === 'DELIVERED' ||
    o.status === 'COMPLETED' ||
    !['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status);
  if (o.paymentMethod === 'COD') {
    if (!ok || !o.deliveredAt) return null;
    const pid = id();
    c.paymentRows.push({
      id: pid,
      purpose: 'ORDER',
      referenceId: o.id,
      userId: o.customer?.userId,
      tenantId: o.outlet.tenantId,
      amount: o.total,
      method: 'COD',
      provider: 'CASH',
      state: 'CAPTURED',
      capturedAt: o.deliveredAt,
      createdAt: o.placedAt,
      metadata: { collectedBy: o.rider?.profileId ?? null },
    });
    return pid;
  }
  const pid = id();
  const wallet = o.paymentMethod === 'WALLET';
  const capturedAt = addMinutes(o.placedAt, 1);
  c.paymentRows.push({
    id: pid,
    purpose: 'ORDER',
    referenceId: o.id,
    userId: o.customer?.userId,
    tenantId: o.outlet.tenantId,
    amount: o.total,
    method: o.paymentMethod,
    provider: wallet ? 'WALLET' : 'RAZORPAY',
    state: ok ? 'CAPTURED' : 'REFUNDED',
    providerOrderId: wallet ? null : rzpOrder(),
    providerPaymentId: wallet ? null : pay(),
    refundedAmount: ok ? 0 : o.total,
    capturedAt,
    createdAt: o.placedAt,
  });
  if (!ok) {
    c.refundRows.push({
      paymentId: pid,
      amount: o.total,
      reason: o.cancelReason ?? 'Order cancelled',
      status: 'PROCESSED',
      toWallet: wallet,
      providerRefundId: wallet ? null : `rfnd_${randomBytes(7).toString('hex')}`,
      processedAt: addMinutes(o.cancelledAt!, 2),
      createdAt: o.cancelledAt!,
    });
  }
  return pid;
}

// ─── orders & everything derived from them ──────────────────────────────────

function addOrderRows(
  ctx: SeedContext,
  c: Ctx2,
  o: SimOrder,
  orderNumber: string,
  paymentId: string | null,
  inv: InventoryResult,
  rng: Rng,
) {
  const ok = o.status === 'DELIVERED' || o.status === 'COMPLETED';
  const terminal = ok || o.status === 'CANCELLED' || o.status === 'REJECTED';
  const outlet = o.outlet;
  const address =
    o.customer && o.type === 'DELIVERY'
      ? { ...o.customer.address, contactName: o.customer.name, contactPhone: o.customer.phone }
      : null;
  const paymentStatus =
    o.channel === 'POS'
      ? ok
        ? 'PAID'
        : 'PENDING'
      : o.paymentMethod === 'COD'
        ? ok
          ? 'PAID'
          : terminal
            ? 'PENDING'
            : 'COD_PENDING'
        : ok || !terminal
          ? 'PAID'
          : 'REFUNDED';
  const live = !terminal;
  const otp = live && o.type === 'DELIVERY' ? rng.digits(4) : null;

  c.orderRows.push({
    id: o.id,
    orderNumber,
    tenantId: outlet.tenantId,
    outletId: outlet.id,
    customerId: o.customer?.userId ?? null,
    customerName: o.customer?.name ?? o.guestName,
    customerPhone: o.customer?.phone ?? null,
    channel: o.channel,
    type: o.type,
    status: o.status as never,
    paymentStatus,
    paymentMethod: o.paymentMethod,
    paymentId,
    subtotal: o.subtotal,
    couponDiscount: o.couponDiscount,
    membershipDiscount: o.membershipDiscount,
    deliveryFee: o.deliveryFee,
    packagingCharge: o.packagingCharge,
    platformFee: o.platformFee,
    taxTotal: o.taxTotal,
    cgst: o.cgst,
    sgst: o.sgst,
    tip: o.tip,
    roundOff: o.roundOff,
    total: o.total,
    couponCode: o.couponCode,
    couponFundedBy: o.couponFundedBy,
    commissionRate: o.commissionRate,
    commissionAmount: o.commissionAmount,
    deliveryAddress: address ?? undefined,
    deliveryLat: address?.lat,
    deliveryLng: address?.lng,
    distanceKm: o.distanceKm,
    tableId: null,
    riderId: o.rider?.profileId ?? null,
    deliveryOtp: otp,
    estimatedReadyAt: o.acceptedAt ? addMinutes(o.acceptedAt, outlet.def.avgPrepTimeMins) : null,
    estimatedDeliveryAt: o.type === 'DELIVERY' ? addMinutes(o.placedAt, promisedMins(o)!) : null,
    placedAt: o.placedAt,
    acceptedAt: o.acceptedAt,
    preparingAt: o.preparingAt,
    readyAt: o.readyAt,
    pickedUpAt: o.pickedUpAt,
    deliveredAt: o.deliveredAt,
    completedAt: o.completedAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    cancelledBy: o.cancelledBy,
    fraudScore: Math.round(o.fraudScore * 1000) / 1000,
    deviceId: o.customer ? `dev_${o.customer.userId.slice(0, 8)}` : null,
    createdAt: o.placedAt,
  });

  // line items; discounts allocated pro-rata for line-level tax
  const discount = o.couponDiscount + o.membershipDiscount;
  for (const l of o.lines) {
    const lineTotal = r2(l.unitPrice * l.quantity);
    const share = o.subtotal > 0 ? (lineTotal / o.subtotal) * discount : 0;
    c.itemRows.push({
      orderId: o.id,
      menuItemId: l.item.id,
      name: l.item.name,
      variantId: l.variant?.id ?? null,
      variant: l.variant?.name ?? null,
      addons: l.addons.map((a) => ({ id: a.id, name: a.name, price: a.price.toFixed(2) })),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      totalPrice: lineTotal,
      gstRate: 5,
      taxAmount: r2((lineTotal - share) * 0.05),
      isVeg: l.item.isVeg,
      kdsStation: l.item.station,
      kdsStatus: ok
        ? 'SERVED'
        : terminal
          ? 'CANCELLED'
          : o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY'
            ? 'READY'
            : o.status === 'PREPARING'
              ? 'IN_PROGRESS'
              : 'QUEUED',
    });
  }

  // every order gets its timeline: merchant and support screens show it for any order
  const ev = (
    from: string | null,
    to: string,
    at: Date | null,
    actorType: 'CUSTOMER' | 'MERCHANT' | 'RIDER' | 'SYSTEM',
    note?: string,
  ) => {
    if (at)
      c.eventRows.push({
        orderId: o.id,
        fromStatus: from as never,
        toStatus: to as never,
        actorType,
        note,
        createdAt: at,
      });
  };
  ev(null, 'PLACED', o.placedAt, 'CUSTOMER');
  ev('PLACED', 'ACCEPTED', o.acceptedAt, 'MERCHANT');
  ev('ACCEPTED', 'PREPARING', o.preparingAt, 'MERCHANT');
  ev('PREPARING', 'READY', o.readyAt, 'MERCHANT');
  if (o.type === 'DELIVERY') {
    ev('READY', 'PICKED_UP', o.pickedUpAt, 'RIDER');
    ev('PICKED_UP', 'OUT_FOR_DELIVERY', o.pickedUpAt ? addMinutes(o.pickedUpAt, 1) : null, 'RIDER');
    ev('OUT_FOR_DELIVERY', 'DELIVERED', o.deliveredAt, 'RIDER');
  } else ev('READY', 'COMPLETED', o.completedAt, 'MERCHANT');
  if (o.status === 'CANCELLED' || o.status === 'REJECTED')
    ev(
      o.acceptedAt ? 'ACCEPTED' : 'PLACED',
      o.status,
      o.cancelledAt,
      o.cancelledBy === 'CUSTOMER' ? 'CUSTOMER' : 'MERCHANT',
      o.cancelReason ?? undefined,
    );

  // kitchen tickets for orders still in the kitchen
  if (live && o.acceptedAt) {
    const stamp = istDateStamp(o.placedAt);
    const name = `KDS-${outlet.id}-${stamp}`;
    const ticketNumber = (ctx.counters.get(name) ?? 0) + 1;
    ctx.counters.set(name, ticketNumber);
    const stations = [...new Set(o.lines.map((l) => l.item.station))];
    for (const station of stations) {
      const items = o.lines.filter((l) => l.item.station === station);
      c.ticketRows.push({
        tenantId: outlet.tenantId,
        outletId: outlet.id,
        orderId: o.id,
        ticketNumber,
        station,
        priority: 0,
        status:
          o.status === 'ACCEPTED' ? 'QUEUED' : o.status === 'PREPARING' ? 'IN_PROGRESS' : 'READY',
        items: items.map((l) => ({
          orderItemId: null,
          name: l.item.name,
          quantity: l.quantity,
          variant: l.variant?.name ?? null,
          addons: l.addons.map((a) => a.name),
          notes: null,
        })),
        startedAt: o.preparingAt,
        readyAt: o.readyAt,
        createdAt: o.acceptedAt,
        updatedAt: o.readyAt ?? o.preparingAt ?? o.acceptedAt,
      });
    }
  }

  // delivery task + rider earnings
  if (o.type === 'DELIVERY' && o.rider && (ok || live)) {
    const zone = ctx.zones.get(outlet.zoneKey)!;
    const distancePay = r2((o.distanceKm ?? 3) * zone.riderPerKm);
    const surgePay = r2((zone.riderBasePay + distancePay) * Math.max(0, o.surge - 1));
    const earning = r2(zone.riderBasePay + distancePay + surgePay);
    const status = ok
      ? 'DELIVERED'
      : o.status === 'OUT_FOR_DELIVERY'
        ? 'PICKED_UP'
        : o.status === 'READY'
          ? 'AT_PICKUP'
          : 'ASSIGNED';
    const deliveryId = id();
    c.deliveries.set(o.id, { id: deliveryId, orderNumber, earning });
    c.deliveryRows.push({
      id: deliveryId,
      orderId: o.id,
      orderNumber,
      tenantId: outlet.tenantId,
      outletId: outlet.id,
      customerId: o.customer?.userId,
      riderId: o.rider.profileId,
      zoneId: zone.id,
      status,
      pickupName: outlet.def.name,
      pickupAddress: `${outlet.def.addressLine1}, ${outlet.locality.name}`,
      pickupLat: outlet.lat,
      pickupLng: outlet.lng,
      pickupPhone: outlet.merchant.owner.phone,
      dropName: o.customer?.name,
      dropAddress: `${o.customer!.address.line1}, ${o.customer!.address.city} ${o.customer!.address.pincode}`,
      dropLat: o.customer!.address.lat,
      dropLng: o.customer!.address.lng,
      dropPhone: o.customer?.phone,
      distanceKm: o.distanceKm ?? 3,
      estimatedMins: Math.round(((o.distanceKm ?? 3) / 20) * 60) + 5,
      orderValue: o.total,
      isCod: o.paymentMethod === 'COD',
      codAmount: o.paymentMethod === 'COD' ? o.total : 0,
      tipAmount: o.tip,
      riderEarning: earning,
      surgeMultiplier: o.surge,
      deliveryOtp: otp,
      readyAt: o.readyAt,
      assignedAt: o.assignedAt,
      arrivedPickupAt: o.pickedUpAt
        ? addMinutes(o.pickedUpAt, -rng.int(1, 4))
        : o.status === 'READY'
          ? addMinutes(ctx.now, -2)
          : null,
      pickedUpAt: o.pickedUpAt,
      arrivedDropAt: o.deliveredAt ? addMinutes(o.deliveredAt, -rng.int(1, 3)) : null,
      deliveredAt: o.deliveredAt,
      searchAttempts: 1,
      proofNote: ok
        ? rng.pick(['Handed to customer', 'Left with security', 'Handed to customer'])
        : null,
      createdAt: o.readyAt ? addMinutes(o.readyAt, -8) : o.placedAt,
    });
    if (ok) {
      const day = istDay(o.deliveredAt!).toISOString();
      const base = { riderId: o.rider.profileId, deliveryId, earnedAt: o.deliveredAt!, _day: day };
      c.earningRows.push({
        ...base,
        type: 'BASE_PAY',
        amount: zone.riderBasePay,
        description: `Delivery ${orderNumber}`,
      });
      c.earningRows.push({
        ...base,
        type: 'DISTANCE_PAY',
        amount: distancePay,
        description: `${(o.distanceKm ?? 3).toFixed(1)} km`,
      });
      if (surgePay > 0)
        c.earningRows.push({
          ...base,
          type: 'SURGE',
          amount: surgePay,
          description: `Surge ×${o.surge}`,
        });
      if (o.tip > 0)
        c.earningRows.push({ ...base, type: 'TIP', amount: o.tip, description: 'Customer tip' });
    }
  }

  // review
  let deliveryRating: number | null = null;
  if (ok && o.customer && o.channel !== 'POS' && rng.chance(0.28)) {
    const rating = rng.weighted([5, 4, 3, 2, 1], [0.55, 0.27, 0.1, 0.05, 0.03]);
    const at = addMinutes(o.completedAt!, rng.int(20, 600));
    if (at < ctx.now) {
      // riders are rated on the delivery itself, independent of the food
      deliveryRating =
        o.type === 'DELIVERY' ? rng.weighted([5, 4, 3, 2], [0.7, 0.22, 0.06, 0.02]) : null;
      c.reviewRows.push({
        orderId: o.id,
        tenantId: outlet.tenantId,
        outletId: outlet.id,
        customerId: o.customer.userId,
        riderId: o.rider?.profileId ?? null,
        rating,
        foodRating: Math.max(1, Math.min(5, rating + rng.weighted([0, 1, -1], [0.7, 0.15, 0.15]))),
        deliveryRating,
        comment: rng.pick(REVIEW_COMMENTS[rating]!) || null,
        tags: [rng.pick(REVIEW_TAGS[rating]!)],
        reply:
          rating <= 3 && rng.chance(0.5)
            ? 'Sorry about this! We have shared your feedback with the kitchen.'
            : null,
        repliedAt: rating <= 3 ? addMinutes(at, 180) : null,
        createdAt: at,
      });
    }
  }
  (o as SimOrder & { deliveryRating?: number | null }).deliveryRating = deliveryRating;

  if (ok && o.couponCode) {
    const coupon = ctx.coupons.get(o.couponCode)!;
    c.redemptionRows.push({
      couponId: coupon.id,
      userId: o.customer!.userId,
      orderId: o.id,
      discount: o.couponDiscount,
      createdAt: o.placedAt,
    });
  }

  // settlement accrual + GST invoices (mirrors payment-service accrueOrder)
  if (ok && o.channel !== 'POS' && o.paymentMethod !== 'CASH') {
    const merchantGross = r2(o.subtotal + o.packagingCharge - o.merchantDiscount);
    const serviceGst = r2((o.deliveryFee + o.platformFee) * 0.18);
    const gstCollected = r2(Math.max(0, o.taxTotal - serviceGst));
    const commission = o.commissionAmount ?? 0;
    const commissionGst = r2(commission * 0.18);
    const tds = r2(merchantGross * 0.001);
    c.lineRows.push({
      tenantId: outlet.tenantId,
      outletId: outlet.id,
      orderId: o.id,
      orderDate: o.placedAt,
      orderTotal: o.total,
      taxableValue: merchantGross,
      gstCollected,
      merchantDiscount: o.merchantDiscount,
      commission,
      commissionGst,
      tcs: 0,
      tds,
      netAmount: r2(merchantGross - commission - commissionGst - tds),
      createdAt: o.completedAt!,
    });
    const recipient = o.customer?.name ?? o.guestName;
    const issue = (
      type: 'CUSTOMER_ORDER' | 'DELIVERY_SERVICE',
      prefix: string,
      taxable: number,
      rate: number,
      hsn: string,
      tenantId: string | null,
    ) => {
      const g = computeGst(taxable, rate, false);
      c.invoiceRows.push({
        invoiceNumber: ctx.docNumber(prefix, o.completedAt!),
        type,
        referenceId: o.id,
        tenantId,
        supplierName: ctx.platform.legalName,
        supplierGstin: ctx.platform.gstin,
        supplierStateCode: '29',
        recipientName: recipient,
        placeOfSupply: '29',
        isInterState: false,
        hsnSac: hsn,
        taxableValue: g.taxableValue,
        cgst: g.cgst,
        sgst: g.sgst,
        igst: g.igst,
        total: g.total,
        issuedAt: o.completedAt!,
      });
    };
    const foodTaxable = r2(
      o.subtotal + o.packagingCharge - o.couponDiscount - o.membershipDiscount,
    );
    if (foodTaxable > 0) issue('CUSTOMER_ORDER', 'FGI', foodTaxable, 5, '996331', outlet.tenantId);
    if (o.serviceTaxable > 0)
      issue('DELIVERY_SERVICE', 'FGS', o.serviceTaxable, 18, '996813', null);
  }

  // analytics fact (mirrors analytics-service upsertOrderFact)
  const costs = inv.unitCost.get(outlet.id)!;
  const foodCost = ok
    ? r2(
        o.lines.reduce(
          (s, l) =>
            s +
            l.quantity *
              l.item.recipe.reduce((x, [key, qty]) => x + qty * (costs.get(key) ?? 0), 0),
          0,
        ),
      )
    : 0;
  // what settlement charged (none for counter sales), like analytics-service
  const commission = o.commissionAmount ?? 0;
  c.factRows.push({
    orderId: o.id,
    orderNumber,
    date: istDay(o.placedAt),
    hour: istParts(o.placedAt).hour,
    tenantId: outlet.tenantId,
    outletId: outlet.id,
    outletType: outlet.def.type,
    city: outlet.locality.city,
    customerId: o.customer?.userId ?? null,
    channel: o.channel,
    orderType: o.type,
    status: o.status,
    paymentMethod: o.paymentMethod,
    itemsCount: o.lines.reduce((s, l) => s + l.quantity, 0),
    gmv: o.total,
    subtotal: o.subtotal,
    discount: r2(o.couponDiscount + o.membershipDiscount),
    deliveryFee: o.deliveryFee,
    tax: o.taxTotal,
    commission,
    platformRevenue: o.channel === 'POS' ? 0 : r2(commission + o.deliveryFee + o.platformFee),
    foodCost,
    isFirstOrder: o.isFirstOrder,
    prepMins: o.readyAt && o.acceptedAt ? minutes(o.acceptedAt, o.readyAt) : null,
    deliveryMins: o.deliveredAt ? minutes(o.placedAt, o.deliveredAt) : null,
    promisedMins: promisedMins(o),
    riderId: o.rider?.profileId ?? null,
    placedAt: o.placedAt,
    deliveredAt: o.completedAt,
  });

  if (o.fraudScore >= 0.7) {
    c.fraudRows.push({
      entityType: 'ORDER',
      entityId: o.id,
      userId: o.customer?.userId,
      score: Math.round(o.fraudScore * 1000) / 1000,
      decision: 'REVIEW',
      reasons: rng.pick([
        ['NEW_DEVICE', 'HIGH_ORDER_VALUE'],
        ['ADDRESS_MISMATCH', 'MULTIPLE_ACCOUNTS_ON_DEVICE'],
        ['COUPON_VELOCITY', 'NEW_ACCOUNT'],
      ]),
      features: {
        orderValue: o.total,
        paymentMethod: o.paymentMethod,
        accountAgeDays: rng.int(0, 5),
        ordersLast24h: rng.int(3, 9),
      },
      createdAt: o.placedAt,
    });
  }
}

// ─── live orders (today) ─────────────────────────────────────────────────────

function buildLiveOrders(ctx: SeedContext, rng: Rng, demo: CustomerRef): SimOrder[] {
  const sgk = ctx.outlets.find((o) => o.def.key === 'spicegarden-koramangala')!;
  const pizza = ctx.outlets.find((o) => o.def.key === 'pizzarepublic-hsr')!;
  const near = (o: OutletRef) =>
    ctx.customers.filter((c) => c.userId !== demo.userId && c.area === o.zoneKey);
  const plan: { outlet: OutletRef; status: string; ago: number; customer: CustomerRef }[] = [
    { outlet: sgk, status: 'PLACED', ago: 2, customer: rng.pick(near(sgk)) },
    { outlet: sgk, status: 'ACCEPTED', ago: 6, customer: rng.pick(near(sgk)) },
    { outlet: sgk, status: 'PREPARING', ago: 13, customer: rng.pick(near(sgk)) },
    { outlet: sgk, status: 'PREPARING', ago: 19, customer: rng.pick(near(sgk)) },
    { outlet: sgk, status: 'READY', ago: 27, customer: rng.pick(near(sgk)) },
    {
      outlet: pizza,
      status: 'PREPARING',
      ago: 9,
      customer: rng.pick(near(pizza).length ? near(pizza) : ctx.customers),
    },
    { outlet: pizza, status: 'OUT_FOR_DELIVERY', ago: 31, customer: demo },
  ];
  const busy = new Set<string>();
  return plan.map((p) => {
    const placedAt = addMinutes(ctx.now, -p.ago);
    const o = buildOrder(
      ctx,
      rng,
      p.outlet,
      0,
      placedAt,
      [p.customer],
      new Map([[p.customer.userId, 5]]),
      {
        channel: 'APP',
        type: 'DELIVERY',
        customer: p.customer,
        paymentMethod: 'UPI',
      },
    );
    o.status = p.status as never;
    // not settled yet, so not charged (payment.commission.accrued sets it on delivery)
    o.commissionRate =
      o.commissionAmount =
      o.cancelledAt =
      o.cancelReason =
      o.cancelledBy =
      o.deliveredAt =
      o.completedAt =
      o.pickedUpAt =
        null;
    o.acceptedAt = p.status === 'PLACED' ? null : addMinutes(placedAt, 1);
    o.preparingAt = ['PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(p.status)
      ? addMinutes(placedAt, 2)
      : null;
    o.readyAt = ['READY', 'OUT_FOR_DELIVERY'].includes(p.status)
      ? addMinutes(ctx.now, -Math.max(1, p.ago - 22))
      : null;
    o.pickedUpAt = p.status === 'OUT_FOR_DELIVERY' ? addMinutes(ctx.now, -6) : null;
    if (o.readyAt) {
      const rider =
        ctx.riders.find((r) => r.zoneKey === p.outlet.zoneKey && !busy.has(r.profileId)) ??
        ctx.riders.find((r) => !busy.has(r.profileId))!;
      busy.add(rider.profileId);
      o.rider = rider;
      o.assignedAt = addMinutes(o.readyAt, -4);
    }
    return o;
  });
}

// ─── ratings, wallets, rider ledger ─────────────────────────────────────────

async function updateOutletRatings(ctx: SeedContext, c: Ctx2) {
  for (const o of ctx.outlets) {
    const rs = c.reviewRows.filter((r) => r.outletId === o.id);
    if (!rs.length) continue;
    await ctx.prisma.outlet.update({
      where: { id: o.id },
      data: {
        ratingAvg: Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10,
        ratingCount: rs.length,
      },
    });
  }
}

async function seedCustomerWallets(
  ctx: SeedContext,
  walletOrders: { o: SimOrder; paymentId: string }[],
  demo: CustomerRef,
) {
  const byCustomer = new Map<string, { o: SimOrder; paymentId: string }[]>();
  for (const w of walletOrders)
    byCustomer.set(w.o.customer!.userId, [...(byCustomer.get(w.o.customer!.userId) ?? []), w]);
  if (!byCustomer.has(demo.userId)) byCustomer.set(demo.userId, []);

  const txns: Prisma.WalletTransactionCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  let wallets = 0;
  for (const [userId, list] of byCustomer) {
    const walletId = id();
    let balance = 0;
    let version = 0;
    const credit = (
      amount: number,
      reason: 'TOPUP' | 'ORDER_REFUND' | 'REFERRAL_BONUS' | 'CASHBACK',
      at: Date,
      key: string,
      ref?: { type: string; id: string },
      description?: string,
    ) => {
      balance = r2(balance + amount);
      version++;
      txns.push({
        walletId,
        type: 'CREDIT',
        reason,
        amount,
        balanceAfter: balance,
        referenceType: ref?.type,
        referenceId: ref?.id,
        description,
        idempotencyKey: key,
        createdAt: at,
      });
    };
    const topup = (amount: number, at: Date) => {
      const pid = id();
      payments.push({
        id: pid,
        purpose: 'WALLET_TOPUP',
        referenceId: walletId,
        userId,
        amount,
        method: 'UPI',
        provider: 'RAZORPAY',
        state: 'CAPTURED',
        providerOrderId: rzpOrder(),
        providerPaymentId: pay(),
        capturedAt: at,
        createdAt: at,
      });
      credit(amount, 'TOPUP', at, `topup:${pid}`, { type: 'PAYMENT', id: pid }, 'Wallet top-up');
    };
    const start = istMidnight(ORDER_DAYS + 3, ctx.now);
    if (userId === demo.userId)
      credit(100, 'REFERRAL_BONUS', start, `referral:${userId}`, undefined, 'Referral bonus');
    for (const { o, paymentId } of list) {
      if (balance < o.total)
        topup(Math.ceil((o.total - balance) / 500) * 500 + 500, addMinutes(o.placedAt, -15));
      balance = r2(balance - o.total);
      version++;
      txns.push({
        walletId,
        type: 'DEBIT',
        reason: 'ORDER_PAYMENT',
        amount: o.total,
        balanceAfter: balance,
        referenceType: 'ORDER',
        referenceId: o.id,
        description: `Order at ${o.outlet.def.name}`,
        idempotencyKey: `payment:${paymentId}:debit`,
        createdAt: addMinutes(o.placedAt, 1),
      });
      if (o.status === 'CANCELLED' || o.status === 'REJECTED')
        credit(
          o.total,
          'ORDER_REFUND',
          addMinutes(o.cancelledAt!, 2),
          `refund:${paymentId}`,
          { type: 'ORDER', id: o.id },
          'Refund for cancelled order',
        );
    }
    await ctx.prisma.wallet.create({
      data: {
        id: walletId,
        ownerType: 'CUSTOMER',
        ownerId: userId,
        balance,
        version,
        createdAt: start,
      },
    });
    wallets++;
  }
  await inChunks(payments, 1000, (x) => ctx.prisma.payment.createMany({ data: x }));
  await inChunks(txns, 2000, (x) => ctx.prisma.walletTransaction.createMany({ data: x }));
  log('customer wallets', `${wallets} wallets, ${txns.length} ledger entries`);
}

async function seedRiderLedger(ctx: SeedContext, orders: SimOrder[], c: Ctx2, rng: Rng) {
  const { prisma } = ctx;
  const weekStart = istWeekStart(ctx.now);
  const todayKey = istDay(ctx.now).toISOString();
  const deliveriesByRider = new Map<string, SimOrder[]>();
  for (const o of orders)
    if (o.rider && o.status === 'DELIVERED')
      deliveriesByRider.set(o.rider.profileId, [
        ...(deliveriesByRider.get(o.rider.profileId) ?? []),
        o,
      ]);

  const attendance: Prisma.RiderAttendanceCreateManyInput[] = [];
  const stats: Prisma.DailyRiderStatsCreateManyInput[] = [];
  const txns: Prisma.WalletTransactionCreateManyInput[] = [];
  const payouts: Prisma.PayoutCreateManyInput[] = [];
  const earnings: Prisma.RiderEarningCreateManyInput[] = [];
  const nowMs = ctx.now.getTime();

  for (const rider of ctx.riders) {
    const list = (deliveriesByRider.get(rider.profileId) ?? []).sort(
      (a, b) => a.deliveredAt!.getTime() - b.deliveredAt!.getTime(),
    );
    const walletId = id();
    let balance = 0;
    let version = 0;
    const days = new Map<string, SimOrder[]>();
    for (const o of list) {
      const k = istDay(o.deliveredAt!).toISOString();
      days.set(k, [...(days.get(k) ?? []), o]);
    }

    // The wallet replays what payment-service does on delivery.delivered: pay and
    // tip are credited per delivery and COD cash is debited (netted against pay).
    // Cash held beyond earnings is handed in at the hub when the shift ends, and
    // the balance is paid out every Monday morning.
    const entry = (
      type: 'CREDIT' | 'DEBIT',
      reason: Prisma.WalletTransactionCreateManyInput['reason'],
      amount: number,
      at: Date,
      key: string,
      ref: { type: string; id: string },
      description: string,
    ) => {
      balance = r2(type === 'CREDIT' ? balance + amount : balance - amount);
      version++;
      txns.push({
        walletId,
        type,
        reason,
        amount,
        balanceAfter: balance,
        referenceType: ref.type,
        referenceId: ref.id,
        description,
        idempotencyKey: key,
        createdAt: at,
      });
    };
    const events: { at: Date; run: () => void }[] = [];
    for (const o of list) {
      const d = c.deliveries.get(o.id)!;
      const ref = { type: 'DELIVERY', id: d.id };
      events.push({
        at: o.deliveredAt!,
        run: () => {
          entry(
            'CREDIT',
            'DELIVERY_EARNING',
            d.earning,
            o.deliveredAt!,
            `earning:${d.id}`,
            ref,
            `Delivery ${d.orderNumber}`,
          );
          if (o.tip > 0)
            entry(
              'CREDIT',
              'TIP',
              o.tip,
              new Date(o.deliveredAt!.getTime() + 1000),
              `tip:${d.id}`,
              ref,
              `Tip for ${d.orderNumber}`,
            );
          if (o.paymentMethod === 'COD')
            entry(
              'DEBIT',
              'COD_COLLECTION',
              o.total,
              new Date(o.deliveredAt!.getTime() + 2000),
              `cod:${d.id}`,
              ref,
              `Cash collected for ${d.orderNumber}`,
            );
        },
      });
    }

    const shifts = new Map<string, { checkIn: Date; checkOut: Date }>();
    for (const [k, ds] of days) {
      const checkIn = addMinutes(ds[0]!.assignedAt!, -rng.int(10, 40));
      const checkOut = addMinutes(ds[ds.length - 1]!.deliveredAt!, rng.int(10, 30));
      shifts.set(k, { checkIn, checkOut });
      const handIn = addMinutes(checkOut, 15);
      if (k === todayKey || handIn.getTime() >= nowMs) continue; // today's cash is still with the rider
      const receipt = `HUB-${rng.digits(6)}`;
      events.push({
        at: handIn,
        run: () => {
          if (balance < 0)
            entry(
              'CREDIT',
              'COD_COLLECTION',
              -balance,
              handIn,
              `cod-deposit:${receipt}`,
              { type: 'CASH_DEPOSIT', id: receipt },
              `Cash deposited · ${receipt}`,
            );
        },
      });
    }

    if (list.length) {
      for (
        let monday = new Date(istWeekStart(list[0]!.deliveredAt!).getTime() + 7 * 86_400_000);
        atIst(monday, 10, 30).getTime() < nowMs;
        monday = new Date(monday.getTime() + 7 * 86_400_000)
      ) {
        const at = atIst(monday, 10, 30);
        events.push({
          at,
          run: () => {
            if (balance <= 0) return;
            const pid = id();
            const amount = balance;
            entry(
              'DEBIT',
              'PAYOUT',
              amount,
              at,
              `payout:${pid}`,
              { type: 'PAYOUT', id: pid },
              'Weekly payout',
            );
            payouts.push({
              id: pid,
              walletId,
              ownerType: 'RIDER',
              ownerId: rider.userId,
              amount,
              status: 'PAID',
              method: 'UPI',
              destination: { upiId: `${rider.name.split(' ')[0]!.toLowerCase()}@okaxis` },
              utr: `UTR${rng.digits(12)}`,
              requestedAt: at,
              processedAt: addMinutes(at, 45),
            });
          },
        });
      }
    }
    for (const e of events.sort((a, b) => a.at.getTime() - b.at.getTime())) e.run();

    for (const [k, ds] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
      const dayEarnings = c.earningRows.filter(
        (e) => e.riderId === rider.profileId && e._day === k,
      );
      for (const { _day, ...e } of dayEarnings) earnings.push(e);
      const total = r2(dayEarnings.reduce((s, e) => s + Number(e.amount), 0));
      const { checkIn, checkOut } = shifts.get(k)!;
      const online = minutes(checkIn, checkOut);
      const distance = Math.round(ds.reduce((s, o) => s + (o.distanceKm ?? 3) + 1.2, 0) * 10) / 10;
      const rejected = rng.int(0, 2);
      attendance.push({
        riderId: rider.profileId,
        date: new Date(k),
        status: 'PRESENT',
        checkInAt: checkIn,
        checkOutAt: checkOut,
        onlineMinutes: online,
        deliveryCount: ds.length,
        distanceKm: distance,
        createdAt: checkIn,
      });
      stats.push({
        riderId: rider.profileId,
        date: new Date(k),
        deliveries: ds.length,
        earnings: total,
        distanceKm: distance,
        onlineMinutes: online,
        avgDeliveryMins:
          Math.round(
            (ds.reduce((s, o) => s + minutes(o.pickedUpAt!, o.deliveredAt!), 0) / ds.length) * 10,
          ) / 10,
        offers: ds.length + rejected,
        accepted: ds.length,
        rejected,
      });
    }
    await prisma.wallet.create({
      data: { id: walletId, ownerType: 'RIDER', ownerId: rider.userId, balance, version },
    });

    const rated = list
      .map((o) => (o as SimOrder & { deliveryRating?: number | null }).deliveryRating)
      .filter((r): r is number => typeof r === 'number');
    const offers = stats
      .filter((s) => s.riderId === rider.profileId)
      .reduce((s, x) => s + (x.offers ?? 0), 0);
    await prisma.riderProfile.update({
      where: { id: rider.profileId },
      data: {
        totalDeliveries: list.length,
        ratingCount: rated.length,
        rating: rated.length
          ? Math.round((rated.reduce((s, r) => s + r, 0) / rated.length) * 100) / 100
          : 4.8,
        acceptanceRate: offers ? Math.round((list.length / offers) * 1000) / 1000 : 1,
        isOnDelivery: orders.some(
          (o) =>
            o.rider?.profileId === rider.profileId &&
            (o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY'),
        ),
      },
    });
  }

  await inChunks(earnings, 3000, (x) => prisma.riderEarning.createMany({ data: x }));
  await inChunks(txns, 3000, (x) => prisma.walletTransaction.createMany({ data: x }));
  if (payouts.length) await prisma.payout.createMany({ data: payouts });
  await inChunks(attendance, 3000, (x) => prisma.riderAttendance.createMany({ data: x }));
  await inChunks(stats, 3000, (x) => prisma.dailyRiderStats.createMany({ data: x }));

  // incentive progress for the current week
  const schemes = await prisma.incentiveScheme.findMany({
    where: { isActive: true, startsAt: { lte: ctx.now }, endsAt: { gt: ctx.now } },
  });
  const progressRows: Prisma.RiderIncentiveCreateManyInput[] = [];
  for (const rider of ctx.riders as RiderRef[]) {
    const week = (deliveriesByRider.get(rider.profileId) ?? []).filter(
      (o) => o.deliveredAt! >= weekStart,
    );
    const profile = await prisma.riderProfile.findUniqueOrThrow({ where: { id: rider.profileId } });
    for (const s of schemes) {
      if (s.zoneId && s.zoneId !== rider.zoneId) continue;
      let progress = 0;
      if (s.type === 'ORDER_COUNT') progress = week.length;
      else if (s.type === 'PEAK_HOURS') {
        const windows = (s.peakWindows as { start: string; end: string }[] | null) ?? [];
        progress = week.filter((o) => {
          const { hour, minute } = istParts(o.deliveredAt!);
          const m = hour * 60 + minute;
          return windows.some(
            (w) =>
              m >= Number(w.start.slice(0, 2)) * 60 + Number(w.start.slice(3)) &&
              m < Number(w.end.slice(0, 2)) * 60 + Number(w.end.slice(3)),
          );
        }).length;
      } else if (s.type === 'RATING')
        progress = profile.rating >= (s.minRating ?? 0) ? week.length : 0;
      else if (s.type === 'LOGIN_HOURS')
        progress = Math.floor(
          stats
            .filter((x) => x.riderId === rider.profileId && (x.date as Date) >= istDay(weekStart))
            .reduce((a, x) => a + (x.onlineMinutes ?? 0), 0) / 60,
        );
      const achieved = progress >= s.target;
      progressRows.push({
        riderId: rider.profileId,
        schemeId: s.id,
        progress: Math.min(progress, s.target),
        target: s.target,
        rewardAmount: s.rewardAmount,
        status: achieved ? 'ACHIEVED' : 'IN_PROGRESS',
        achievedAt: achieved ? ctx.now : null,
      });
    }
  }
  if (progressRows.length) await prisma.riderIncentive.createMany({ data: progressRows });

  // riders who are online today have an open attendance record
  const online = await prisma.riderProfile.findMany({ where: { isOnline: true } });
  const today = istDay(ctx.now);
  const todayStart = istMidnight(0, ctx.now);
  for (const r of online) {
    const checkIn = new Date(
      Math.max(atIst(todayStart, 8, 30).getTime(), ctx.now.getTime() - 4 * 3600_000),
    );
    if (checkIn >= ctx.now) continue;
    await prisma.riderAttendance.upsert({
      where: { riderId_date: { riderId: r.id, date: today } },
      create: {
        riderId: r.id,
        date: today,
        status: 'PRESENT',
        checkInAt: checkIn,
        checkInLat: r.currentLat,
        checkInLng: r.currentLng,
        onlineMinutes: minutes(checkIn, ctx.now),
      },
      update: { checkOutAt: null },
    });
  }
  log(
    'rider ledger',
    `${earnings.length} earnings, ${txns.length} wallet entries, ${payouts.length} payouts, ${attendance.length} attendance days, ${progressRows.length} incentive trackers`,
  );
}
