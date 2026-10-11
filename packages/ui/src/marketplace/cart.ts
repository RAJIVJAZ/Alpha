/**
 * Buyer-side cart maths for the B2B marketplace. It mirrors the supplier-service
 * rules (domain/b2b-pricing.ts: tier prices, MOQ, step and max per order) so a
 * buyer sees a problem before checkout; the service re-prices and re-checks
 * every order, adding dealer discounts and delivery charges.
 */
import type { BuyerSegment, SellerProduct } from '../seller/types';

export interface MarketProduct extends SellerProduct {
  tenantId: string;
  seller: {
    tenantId: string;
    sellerName: string;
    avgRating?: number;
    ratingCount?: number;
    onTimeRate?: number;
  };
}

export interface CartLine {
  product: MarketProduct;
  /** Packs. */
  quantity: number;
}

type Rules = Pick<SellerProduct, 'moq' | 'stepQty' | 'maxOrderQty' | 'stockQty'>;

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round2 = (v: number) => Math.round(v * 100) / 100;
const step = (p: Rules) => (Number(p.stepQty) > 0 ? Number(p.stepQty) : 1);

/** The price segment the service applies to this kind of business (dealers get DEALER at checkout). */
export const segmentFor = (tenantType?: string): BuyerSegment =>
  tenantType === 'RETAILER' || tenantType === 'WHOLESALER' ? 'RETAILER' : 'RESTAURANT';

/** Price per pack at `qty`: the highest tier break the buyer reaches (own segment beats ALL), else the base price. */
export function unitPrice(
  p: Pick<SellerProduct, 'price' | 'priceTiers'>,
  qty: number,
  segment: BuyerSegment,
  at = new Date(),
): number {
  const tiers = p.priceTiers
    .filter(
      (t) =>
        (t.segment === segment || t.segment === 'ALL') &&
        qty >= Number(t.minQty) &&
        (t.maxQty == null || qty <= Number(t.maxQty)) &&
        (!t.validFrom || new Date(t.validFrom) <= at) &&
        (!t.validTo || new Date(t.validTo) >= at),
    )
    .sort(
      (a, b) =>
        Number(b.minQty) - Number(a.minQty) ||
        Number(b.segment !== 'ALL') - Number(a.segment !== 'ALL'),
    );
  return Number(tiers[0]?.unitPrice ?? p.price);
}

/** Why `qty` packs can't be ordered (MOQ, step, max per order, stock), or null. */
export function qtyError(p: Rules, qty: number): string | null {
  const moq = Number(p.moq);
  if (!Number.isFinite(qty) || qty <= 0) return 'Enter a quantity';
  if (qty < moq) return `Minimum order is ${moq} packs`;
  if (p.maxOrderQty != null && qty > Number(p.maxOrderQty))
    return `At most ${Number(p.maxOrderQty)} packs per order`;
  const units = (qty - moq) / step(p);
  if (Math.abs(units - Math.round(units)) > 1e-6)
    return `Order ${moq} packs, then in steps of ${step(p)}`;
  if (qty > Number(p.stockQty)) return `Only ${Number(p.stockQty)} packs in stock`;
  return null;
}

/**
 * The next orderable quantity above (dir 1) or below (dir -1) `qty`: the MOQ, then
 * MOQ + whole steps. Null when there is none (below the MOQ, or past max / stock).
 */
export function nextQty(p: Rules, qty: number, dir: 1 | -1): number | null {
  const moq = Number(p.moq);
  const k = (qty - moq) / step(p);
  const next =
    dir === 1
      ? qty < moq
        ? moq
        : moq + (Math.floor(k + 1e-6) + 1) * step(p)
      : moq + (Math.ceil(k - 1e-6) - 1) * step(p);
  const out = round3(next);
  if (out < moq) return null;
  if (dir === 1 && qtyError(p, out)) return null;
  return out;
}

/** Adds the product, or sets its quantity when it is already in the cart. */
export function putLine(lines: CartLine[], product: MarketProduct, quantity: number): CartLine[] {
  return lines.some((l) => l.product.id === product.id)
    ? lines.map((l) => (l.product.id === product.id ? { product, quantity } : l))
    : [...lines, { product, quantity }];
}

export const removeLine = (lines: CartLine[], productId: string) =>
  lines.filter((l) => l.product.id !== productId);

/** One order per seller: the cart grouped by seller, in the order they were added. */
export function bySeller(lines: CartLine[]) {
  const groups = new Map<string, { sellerId: string; sellerName: string; lines: CartLine[] }>();
  for (const l of lines) {
    const g = groups.get(l.product.tenantId) ?? {
      sellerId: l.product.tenantId,
      sellerName: l.product.seller.sellerName,
      lines: [],
    };
    g.lines.push(l);
    groups.set(g.sellerId, g);
  }
  return [...groups.values()];
}

/** Estimated pre-delivery totals at catalogue prices; GST per line on the pre-tax amount. */
export function cartTotals(lines: CartLine[], segment: BuyerSegment, at = new Date()) {
  let subtotal = 0;
  let gst = 0;
  for (const l of lines) {
    const amount = round2(l.quantity * unitPrice(l.product, l.quantity, segment, at));
    subtotal += amount;
    gst += round2((amount * Number(l.product.gstRate)) / 100);
  }
  return { subtotal: round2(subtotal), gst: round2(gst), total: round2(subtotal + gst) };
}
