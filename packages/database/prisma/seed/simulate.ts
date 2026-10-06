import { haversineKm } from './helpers';
import { FESTIVALS } from './catalog';
import type { CustomerRef, MenuItemRef, OutletRef, RiderRef, SeedContext } from './context';
import { addMinutes, atIst, id, istIsoWeekday, istMidnight, r2, Rng } from './lib';

export const HISTORY_DAYS = 90;
/** Orders older than this are only kept as consumption roll-ups (archived). */
export const ORDER_DAYS = 60;

type Channel = 'APP' | 'WEB' | 'QR' | 'POS';
type OrderType = 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN';
type Method = 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET' | 'COD' | 'CASH';

export interface SimLine {
  item: MenuItemRef;
  variant: { id: string; name: string; priceDelta: number } | null;
  addons: { id: string; name: string; price: number }[];
  quantity: number;
  unitPrice: number;
}

export interface SimOrder {
  id: string;
  outlet: OutletRef;
  daysAgo: number;
  placedAt: Date;
  channel: Channel;
  type: OrderType;
  customer: CustomerRef | null;
  guestName: string | null;
  lines: SimLine[];
  /** Terminal for history; live (in-progress) states are used for today's orders. */
  status: 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'REJECTED' | 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY';
  cancelledBy: 'CUSTOMER' | 'MERCHANT' | null;
  cancelReason: string | null;
  paymentMethod: Method;
  couponCode: string | null;
  couponFundedBy: 'PLATFORM' | 'MERCHANT' | 'SHARED' | null;
  subtotal: number;
  couponDiscount: number;
  membershipDiscount: number;
  deliveryFee: number;
  packagingCharge: number;
  platformFee: number;
  foodTaxable: number;
  serviceTaxable: number;
  cgst: number;
  sgst: number;
  taxTotal: number;
  tip: number;
  roundOff: number;
  total: number;
  merchantDiscount: number;
  commissionRate: number | null;
  commissionAmount: number | null;
  distanceKm: number | null;
  surge: number;
  acceptedAt: Date | null;
  preparingAt: Date | null;
  readyAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  rider: RiderRef | null;
  assignedAt: Date | null;
  fraudScore: number;
  isFirstOrder: boolean;
}

export interface Simulation {
  orders: SimOrder[];
  /** outletId -> ingredient key -> daysAgo -> consumed quantity */
  consumption: Map<string, Map<string, Map<number, { qty: number; orders: number }>>>;
  /** IST dates (YYYY-MM-DD) with rain in Bengaluru. */
  rainyDays: Set<string>;
}

const WEEKDAY_FACTOR: Record<string, number[]> = {
  // index: ISO weekday 1..7 -> [0] unused
  meals: [0, 0.88, 0.86, 0.9, 0.95, 1.12, 1.3, 1.25],
  breakfast: [0, 1.0, 0.97, 0.97, 1.0, 1.0, 1.25, 1.35],
  evening: [0, 0.9, 0.9, 0.92, 0.95, 1.1, 1.35, 1.3],
  allday: [0, 0.9, 0.88, 0.92, 0.96, 1.1, 1.28, 1.24],
};

const HOUR_PROFILE: Record<string, [number, number][]> = {
  meals: [[11, 3], [12, 9], [13, 12], [14, 8], [15, 3], [16, 2], [17, 2], [18, 3], [19, 8], [20, 12], [21, 11], [22, 6], [23, 2]],
  breakfast: [[7, 10], [8, 14], [9, 12], [10, 7], [11, 3], [12, 5], [13, 6], [14, 3], [16, 2], [17, 3], [18, 3], [19, 4], [20, 4], [21, 2]],
  evening: [[16, 4], [17, 9], [18, 13], [19, 14], [20, 11], [21, 6], [22, 2]],
  allday: [[12, 5], [13, 7], [14, 5], [15, 4], [16, 6], [17, 8], [18, 9], [19, 10], [20, 9], [21, 6], [22, 3]],
};

/** Category pairs customers tend to order together (feeds item-item recommendations). */
const COMPLEMENTS: Record<string, { category: string; p: number }[]> = {
  'Main Course': [{ category: 'Breads', p: 0.65 }],
  'Rice & Biryani': [{ category: 'Desserts & Drinks', p: 0.2 }],
  Pizzas: [{ category: 'Sides', p: 0.4 }, { category: 'Beverages', p: 0.25 }],
  Breakfast: [{ category: 'Beverages', p: 0.5 }],
  'Rice Bowls': [{ category: 'Drinks', p: 0.2 }],
};

const CANCEL_REASONS = ['Ordered by mistake', 'Delivery taking too long', 'Changed my mind'];
const REJECT_REASONS = ['Item out of stock', 'Kitchen too busy', 'Outlet closing soon'];

export function festivalOn(ymd: string) {
  return FESTIVALS.find((f) => f.date === ymd) ?? null;
}

const istYmd = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export function simulate(ctx: SeedContext): Simulation {
  const rng = new Rng(9001);
  const orders: SimOrder[] = [];
  const consumption: Simulation['consumption'] = new Map();
  const rainyDays = new Set<string>();
  const ordersByCustomer = new Map<string, number>();
  const riderBusyUntil = new Map<string, number>();

  // customers reachable from each outlet
  const reach = new Map<string, CustomerRef[]>();
  for (const o of ctx.outlets) {
    const radius = o.def.type === 'FOOD_CART' ? 6 : 8;
    const near = ctx.customers.filter((c) => haversineKm(c.address, o) <= radius);
    reach.set(o.id, near.length >= 4 ? near : ctx.customers);
  }

  // day 0 is today up to the seed time; orders still in progress are added separately as live orders
  for (let daysAgo = HISTORY_DAYS; daysAgo >= 0; daysAgo--) {
    const dayStart = istMidnight(daysAgo, ctx.now);
    const ymd = istYmd(dayStart);
    const weekday = istIsoWeekday(dayStart);
    const festival = festivalOn(ymd);
    const rainy = rng.chance(0.2);
    if (rainy) rainyDays.add(ymd);
    const trend = 1 + 0.002 * (HISTORY_DAYS - daysAgo);

    const dayOrders: SimOrder[] = [];
    for (const outlet of ctx.outlets) {
      const def = outlet.def;
      // only customers who had signed up by this day
      const joined = reach.get(outlet.id)!.filter((c) => c.joinedAt.getTime() <= dayStart.getTime());
      const eligible = joined.length ? joined : reach.get(outlet.id)!;
      const weather = rainy ? (def.type === 'FOOD_CART' ? 0.75 : 1.12) : 1;
      const mean = def.baseDailyOrders * WEEKDAY_FACTOR[def.profile]![weekday]! * trend * (festival?.impact ?? 1) * weather * Math.max(0.6, rng.normal(1, 0.08));
      const n = rng.poisson(mean);
      const hours = HOUR_PROFILE[def.profile]!;
      for (let k = 0; k < n; k++) {
        const hour = rng.weighted(hours.map((h) => h[0]), hours.map((h) => h[1]));
        const placedAt = atIst(dayStart, hour, rng.int(0, 59));
        const o = buildOrder(ctx, rng, outlet, daysAgo, placedAt, eligible, ordersByCustomer);
        const finishedAt = o.completedAt ?? o.deliveredAt ?? o.cancelledAt;
        if (daysAgo === 0 && (!finishedAt || finishedAt.getTime() > ctx.now.getTime() - 2 * 60_000)) continue;
        dayOrders.push(o);
      }
    }

    dayOrders.sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
    for (const o of dayOrders) {
      if (o.customer && o.status !== 'CANCELLED' && o.status !== 'REJECTED') {
        const prior = ordersByCustomer.get(o.customer.userId) ?? 0;
        o.isFirstOrder = prior === 0;
        ordersByCustomer.set(o.customer.userId, prior + 1);
      }
      if (o.type === 'DELIVERY' && o.status === 'DELIVERED') assignRider(ctx, rng, o, riderBusyUntil);
      if (o.status === 'DELIVERED' || o.status === 'COMPLETED') addConsumption(consumption, o);
      orders.push(o);
    }
  }
  return { orders, consumption, rainyDays };
}

export interface ForcedOrder {
  channel: Channel;
  type: OrderType;
  customer: CustomerRef;
  paymentMethod: Method;
}

export function buildOrder(
  ctx: SeedContext,
  rng: Rng,
  outlet: OutletRef,
  daysAgo: number,
  placedAt: Date,
  reachable: CustomerRef[],
  ordersByCustomer: Map<string, number>,
  force?: ForcedOrder,
): SimOrder {
  const def = outlet.def;
  const mix = def.channelMix;
  const channel = force?.channel ?? rng.weighted<Channel>(['APP', 'WEB', 'QR', 'POS'], [mix.APP, mix.WEB, def.qr ? mix.QR : 0, mix.POS]);
  const type: OrderType =
    force?.type ??
    (channel === 'QR' ? 'DINE_IN' : channel === 'POS' ? (def.dineIn && rng.chance(0.6) ? 'DINE_IN' : 'TAKEAWAY') : rng.chance(0.86) ? 'DELIVERY' : 'TAKEAWAY');
  const online = channel === 'APP' || channel === 'WEB';
  const customer = force?.customer ?? (online || (channel === 'QR' && rng.chance(0.5)) ? rng.weighted(reachable, reachable.map((c) => c.weight)) : null);

  // ── basket ────────────────────────────────────────────────────────────────
  const lines: SimLine[] = [];
  const categories = new Map<string, string>();
  for (const cat of def.menu.categories) for (const it of cat.items) categories.set(it.name, cat.name);
  const k = rng.weighted([1, 2, 3, 4], [0.36, 0.34, 0.2, 0.1]);
  const chosen = new Set<MenuItemRef>();
  for (let i = 0; i < k && chosen.size < outlet.items.length; i++) {
    const pool = outlet.items.filter((it) => !chosen.has(it));
    chosen.add(rng.weighted(pool, pool.map((it) => it.popularity)));
  }
  for (const it of [...chosen]) {
    for (const c of COMPLEMENTS[categories.get(it.name) ?? ''] ?? []) {
      if (!rng.chance(c.p)) continue;
      const pool = outlet.items.filter((x) => categories.get(x.name) === c.category && !chosen.has(x));
      if (pool.length) chosen.add(rng.weighted(pool, pool.map((x) => x.popularity)));
    }
  }
  for (const item of chosen) {
    const isBread = /Naan|Roti/.test(item.name);
    const quantity = isBread ? rng.int(2, 4) : rng.chance(0.85) ? 1 : 2;
    let variant: SimLine['variant'] = null;
    if (item.variants.length) {
      const idx = rng.weighted([0, 1, 2].slice(0, item.variants.length), [0.5, 0.35, 0.15].slice(0, item.variants.length));
      const v = item.variants[idx]!;
      variant = { id: v.id, name: v.name, priceDelta: v.priceDelta };
    }
    const addons = item.addons.length && rng.chance(0.25) ? [rng.pick(item.addons)] : [];
    const unitPrice = item.price + (variant?.priceDelta ?? 0) + addons.reduce((s, a) => s + a.price, 0);
    lines.push({ item, variant, addons, quantity, unitPrice });
  }
  const subtotal = r2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));

  // ── status & payment ─────────────────────────────────────────────────────
  const r = rng.next();
  let status: SimOrder['status'] = type === 'DELIVERY' ? 'DELIVERED' : 'COMPLETED';
  let cancelledBy: SimOrder['cancelledBy'] = null;
  let cancelReason: string | null = null;
  if (online && r < 0.035) [status, cancelledBy, cancelReason] = ['CANCELLED', 'CUSTOMER', rng.pick(CANCEL_REASONS)];
  else if (online && r < 0.05) [status, cancelledBy, cancelReason] = ['REJECTED', 'MERCHANT', rng.pick(REJECT_REASONS)];
  else if (!online && r < 0.015) [status, cancelledBy, cancelReason] = ['CANCELLED', 'MERCHANT', 'Customer left'];

  const paymentMethod: Method =
    force?.paymentMethod ??
    (channel === 'POS'
      ? rng.weighted<Method>(['CASH', 'UPI'], [0.55, 0.45])
      : channel === 'QR'
        ? rng.weighted<Method>(['UPI', 'CARD'], [0.8, 0.2])
        : rng.weighted<Method>(['UPI', 'CARD', 'WALLET', 'COD', 'NETBANKING'], [0.55, 0.18, 0.07, type === 'DELIVERY' ? 0.14 : 0, 0.06]));

  // ── coupon & membership ──────────────────────────────────────────────────
  let couponCode: string | null = null;
  if (online && daysAgo <= 60 && !force) {
    const first = customer && (ordersByCustomer.get(customer.userId) ?? 0) === 0;
    if (first && subtotal >= 149 && rng.chance(0.7)) couponCode = 'WELCOME50';
    else if (outlet.merchant.key === 'spicegarden' && subtotal >= 399 && rng.chance(0.12)) couponCode = 'SPICE15';
    else if (subtotal >= 299 && rng.chance(0.1)) couponCode = 'FOODGRID20';
    else if (paymentMethod === 'UPI' && subtotal >= 249 && rng.chance(0.06)) couponCode = 'UPI30';
    else if (type === 'DELIVERY' && subtotal >= 199 && rng.chance(0.04)) couponCode = 'FREEDEL';
  }
  const coupon = couponCode ? ctx.coupons.get(couponCode)! : null;
  let couponDiscount = 0;
  let freeDelivery = false;
  if (coupon?.type === 'FLAT') couponDiscount = coupon.value;
  else if (coupon?.type === 'PERCENT') couponDiscount = Math.min(coupon.maxDiscount ?? Infinity, r2((subtotal * coupon.value) / 100));
  else if (coupon?.type === 'FREE_DELIVERY') freeDelivery = true;
  const member = !!(online && customer?.membershipSince && placedAt >= customer.membershipSince);
  const membershipDiscount = member ? Math.min(50, r2(subtotal * 0.05)) : 0;

  // ── fees & tax ───────────────────────────────────────────────────────────
  let distanceKm: number | null = null;
  let deliveryFee = 0;
  const zone = ctx.zones.get(outlet.zoneKey)!;
  const surge = outlet.zoneKey === 'whitefield' ? 1.1 : 1;
  if (type === 'DELIVERY' && customer) {
    distanceKm = Math.round(haversineKm(outlet, customer.address) * 1.3 * 10) / 10;
    deliveryFee = Math.round((zone.baseFee + Math.max(0, distanceKm - zone.freeKm) * zone.perKmFee) * surge);
    if (freeDelivery || (member && subtotal >= 149)) deliveryFee = 0;
  }
  const packagingCharge = type === 'DINE_IN' ? 0 : def.packagingCharge;
  const platformFee = online ? 5 : 0;
  const foodTaxable = r2(subtotal - couponDiscount - membershipDiscount + packagingCharge);
  const serviceTaxable = r2(deliveryFee + platformFee);
  const foodGst = r2(foodTaxable * 0.05);
  const serviceGst = r2(serviceTaxable * 0.18);
  // split once on the bill like order-service: CGST takes the lower half-paisa
  const taxPaise = Math.round((foodGst + serviceGst) * 100);
  const cgst = Math.floor(taxPaise / 2) / 100;
  const sgst = (taxPaise - Math.floor(taxPaise / 2)) / 100;
  const taxTotal = r2(foodGst + serviceGst);
  const tip = type === 'DELIVERY' && rng.chance(0.12) ? rng.pick([10, 20, 30]) : 0;
  const raw = r2(foodTaxable + serviceTaxable + taxTotal + tip);
  const total = Math.round(raw);
  const merchantDiscount = coupon?.fundedBy === 'MERCHANT' ? couponDiscount : coupon?.fundedBy === 'SHARED' ? r2(couponDiscount / 2) : 0;
  const settles = channel !== 'POS' && paymentMethod !== 'CASH';
  const commissionRate = settles ? outlet.commissionRate : null;
  const commissionAmount = commissionRate !== null ? r2(((subtotal + packagingCharge - merchantDiscount) * commissionRate) / 100) : null;

  // ── timeline ─────────────────────────────────────────────────────────────
  const ok = status === 'DELIVERED' || status === 'COMPLETED';
  const acceptedAt = status === 'REJECTED' || (status === 'CANCELLED' && cancelledBy === 'CUSTOMER') ? null : addMinutes(placedAt, rng.int(1, 3));
  const preparingAt = ok ? addMinutes(acceptedAt!, rng.int(0, 2)) : null;
  const readyAt = ok ? addMinutes(preparingAt!, Math.max(4, def.avgPrepTimeMins + rng.int(-5, 8))) : null;
  const pickedUpAt = ok && type === 'DELIVERY' ? addMinutes(readyAt!, rng.int(2, 9)) : null;
  const deliveredAt = pickedUpAt ? addMinutes(pickedUpAt, Math.round(((distanceKm ?? 3) / 20) * 60) + rng.int(2, 8)) : null;
  const completedAt = ok ? (deliveredAt ?? addMinutes(readyAt!, type === 'DINE_IN' ? rng.int(20, 50) : rng.int(3, 15))) : null;
  const cancelledAt = ok ? null : addMinutes(placedAt, rng.int(2, 9));

  return {
    id: id(), outlet, daysAgo, placedAt, channel, type, customer, guestName: customer ? null : channel === 'POS' ? 'Walk-in' : 'Guest',
    lines, status, cancelledBy, cancelReason, paymentMethod, couponCode, couponFundedBy: coupon?.fundedBy ?? null,
    subtotal, couponDiscount, membershipDiscount, deliveryFee, packagingCharge, platformFee, foodTaxable, serviceTaxable, cgst, sgst, taxTotal, tip,
    roundOff: r2(total - raw), total, merchantDiscount, commissionRate, commissionAmount, distanceKm, surge,
    acceptedAt, preparingAt, readyAt, pickedUpAt, deliveredAt, completedAt, cancelledAt, rider: null, assignedAt: null,
    fraudScore: rng.chance(0.006) ? rng.float(0.72, 0.93) : rng.float(0.01, 0.25), isFirstOrder: false,
  };
}

function assignRider(ctx: SeedContext, rng: Rng, o: SimOrder, busyUntil: Map<string, number>) {
  const assignAt = addMinutes(o.readyAt!, -rng.int(2, 6));
  const free = (r: RiderRef) => (busyUntil.get(r.profileId) ?? 0) <= assignAt.getTime();
  const local = ctx.riders.filter((r) => r.zoneKey === o.outlet.zoneKey);
  const candidates = local.filter(free).length ? local.filter(free) : ctx.riders.filter(free).length ? ctx.riders.filter(free) : ctx.riders;
  const rider = candidates.length === ctx.riders.length && !ctx.riders.some(free)
    ? [...ctx.riders].sort((a, b) => (busyUntil.get(a.profileId) ?? 0) - (busyUntil.get(b.profileId) ?? 0))[0]!
    : rng.pick(candidates);
  o.rider = rider;
  o.assignedAt = assignAt;
  busyUntil.set(rider.profileId, Math.max(busyUntil.get(rider.profileId) ?? 0, o.deliveredAt!.getTime() + 5 * 60_000));
}

function addConsumption(consumption: Simulation['consumption'], o: SimOrder) {
  let byIngredient = consumption.get(o.outlet.id);
  if (!byIngredient) consumption.set(o.outlet.id, (byIngredient = new Map()));
  const touched = new Set<string>();
  const add = (key: string, qty: number) => {
    let byDay = byIngredient!.get(key);
    if (!byDay) byIngredient!.set(key, (byDay = new Map()));
    const cell = byDay.get(o.daysAgo) ?? { qty: 0, orders: 0 };
    cell.qty += qty;
    if (!touched.has(key)) {
      cell.orders++;
      touched.add(key);
    }
    byDay.set(o.daysAgo, cell);
  };
  // Mirrors inventory-service: recipes are per menu item (sizes and add-ons
  // do not change the bill of materials).
  for (const l of o.lines) for (const [key, qty] of l.item.recipe) add(key, qty * l.quantity);
}
