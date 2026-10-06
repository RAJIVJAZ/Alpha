import { randomBytes } from 'node:crypto';
import { computeGst, haversineKm, isInterState } from '@foodgrid/utils';
import type { Prisma } from '../../generated/client';
import { INGREDIENTS, LOCALITIES, SELLERS, type SellerKey } from './catalog';
import type { OutletRef, SeedContext } from './context';
import { addMinutes, atIst, id, inChunks, istDay, istMidnight, log, r2, r3, Rng } from './lib';
import { HISTORY_DAYS, ORDER_DAYS, type Simulation } from './simulate';

/** Mirrors inventory-service DEFAULT_MARKETPLACE_CATEGORY. */
const MARKETPLACE_CATEGORY: Record<string, string> = {
  FLOUR: 'FLOUR', OIL: 'OIL', SUGAR: 'SUGAR', DAIRY: 'DAIRY', VEGETABLES: 'VEGETABLES', FRUITS: 'FRUITS', PACKAGING: 'PACKAGING',
  SPICES: 'SPICES', GRAINS: 'RICE', PULSES: 'PULSES', BEVERAGES: 'BEVERAGES', FROZEN: 'FROZEN',
};
/** Commission on B2B goods sales (mirrors the seeded commission rules). */
const B2B_COMMISSION_PCT: Partial<Record<SellerKey, number>> = { bharat: 2.5 };
const DEFAULT_B2B_COMMISSION_PCT = 3;
/** POs above this total wait for the owner (ProcurementSettings.autoApproveBelow). */
const autoApproveLimit = (merchantKey: string) => (merchantKey === 'spicegarden' ? 2000 : 3000);

type Product = SeedContext['products'][number];

interface Batch {
  id: string;
  qty: number;
  remaining: number;
  unitCost: number;
  receivedAt: Date;
  expiresAt: Date;
  purchase: Purchase | null;
}

interface Purchase {
  outlet: OutletRef;
  key: string;
  product: Product | null;
  placedDay: number;
  placedAt: Date;
  arrivalDay: number;
  arrivalAt: Date;
  packs: number;
  packPrice: number;
  baseQty: number;
  unitCost: number;
  emergency: boolean;
  poId?: string;
  movement?: Prisma.StockMovementCreateManyInput;
  batch?: Prisma.StockBatchCreateManyInput;
}

export interface InventoryResult {
  /** outletId -> ingredient key -> current weighted average cost per unit */
  unitCost: Map<string, Map<string, number>>;
}

const sellerDef = (k: SellerKey) => SELLERS.find((s) => s.key === k)!;

function serviceable(seller: SellerKey, outlet: OutletRef) {
  return seller !== 'lakshmi' || haversineKm(outlet, LOCALITIES.jayanagar!) <= 8;
}

function packPrice(p: Product, packs: number, daysAgo: number) {
  let price = p.price;
  for (const t of p.tiers) if ((t.segment === 'ALL' || t.segment === 'RESTAURANT') && packs >= t.minQty && t.unitPrice < price) price = t.unitPrice;
  // gentle input-cost inflation: prices were ~4.5% lower 90 days ago
  return r2(price * (1 - 0.0005 * daysAgo));
}

export async function seedInventory(ctx: SeedContext, sim: Simulation): Promise<InventoryResult> {
  const { prisma } = ctx;
  const rng = new Rng(4242);
  const unitCost: InventoryResult['unitCost'] = new Map();

  const ingredientRows: Prisma.IngredientCreateManyInput[] = [];
  const batchRows: Prisma.StockBatchCreateManyInput[] = [];
  const movementRows: Prisma.StockMovementCreateManyInput[] = [];
  const consumptionRows: Prisma.ConsumptionDailyCreateManyInput[] = [];
  const purchases: Purchase[] = [];
  const lowStock: { outlet: OutletRef; key: string; ingredientId: string; balance: number; reorderLevel: number; avgDaily: number; maxStock: number; leadDays: number; product: Product | null; inFlight: boolean }[] = [];

  for (const outlet of ctx.outlets) {
    const keys = [...new Set(outlet.items.flatMap((i) => i.recipe.map(([k]) => k)))].sort();
    const costs = new Map<string, number>();
    unitCost.set(outlet.id, costs);
    const series = sim.consumption.get(outlet.id) ?? new Map();
    const lowChance = outlet.def.key === 'spicegarden-koramangala' ? 0.45 : 0.25;

    for (const key of keys) {
      const def = INGREDIENTS[key]!;
      const ingredientId = id();
      outlet.ingredientIds.set(key, ingredientId);
      const daily = series.get(key) ?? new Map<number, { qty: number; orders: number }>();
      const avgDaily = Math.max(0.001, [...daily.values()].reduce((s, c) => s + c.qty, 0) / HISTORY_DAYS);

      // preferred & alternative products
      const candidates = ctx.products
        .filter((p) => p.ingredient === key && serviceable(p.seller, outlet))
        .map((p) => {
          const perBase = packPrice(p, 1, 0) / p.packSize;
          const minLot = p.moq * p.packSize;
          const lotPenalty = minLot > avgDaily * 21 ? 1.6 : 1;
          return { p, score: perBase * (1 + p.leadTimeHours / 240) * lotPenalty };
        })
        .sort((a, b) => a.score - b.score);
      const preferred = candidates[0]?.p ?? null;
      const alternative = candidates[1]?.p ?? null;

      const leadDays = preferred ? Math.max(1, Math.ceil(preferred.leadTimeHours / 24)) : def.leadTimeDays;
      const perishable = def.shelfLifeDays <= 14;
      const coverDays = perishable ? Math.max(1, Math.min(def.shelfLifeDays - 1, 3)) : def.category === 'PACKAGING' ? 14 : 10;
      const safety = avgDaily * (perishable ? 0.5 : 2);
      const reorderLevel = avgDaily * leadDays + safety;
      const maxStock = reorderLevel + avgDaily * coverDays;
      const isLow = !!preferred && rng.chance(lowChance);
      // how many days before today replenishment stopped — varies how far below the reorder level each item ends
      const lowWindow = rng.int(2, leadDays + 3);

      const batches: Batch[] = [];
      let balance = 0;
      let wac = preferred ? packPrice(preferred, 1, HISTORY_DAYS) / preferred.packSize : def.cost;
      let lastPrice = wac;
      let pending: Purchase | null = null;

      const receive = (p: Purchase, reason: string, refType: string | null, refId: string | null) => {
        const batch: Batch = {
          id: id(), qty: p.baseQty, remaining: p.baseQty, unitCost: p.unitCost, receivedAt: p.arrivalAt,
          expiresAt: new Date(p.arrivalAt.getTime() + def.shelfLifeDays * 86_400_000), purchase: p,
        };
        batches.push(batch);
        wac = balance + p.baseQty > 0 ? (balance * wac + p.baseQty * p.unitCost) / (balance + p.baseQty) : p.unitCost;
        lastPrice = p.unitCost;
        balance += p.baseQty;
        p.movement = {
          tenantId: outlet.tenantId, outletId: outlet.id, ingredientId, type: p.placedDay > HISTORY_DAYS ? 'OPENING' : 'PURCHASE',
          quantity: r3(p.baseQty), unitCost: r2(p.unitCost * 100) / 100, totalCost: r2(p.baseQty * p.unitCost), balanceAfter: r3(balance),
          referenceType: refType, referenceId: refId, reason, createdAt: p.arrivalAt,
        };
        movementRows.push(p.movement);
      };
      const consume = (qty: number) => {
        let left = qty;
        for (const b of batches) {
          if (left <= 0) break;
          const take = Math.min(b.remaining, left);
          b.remaining -= take;
          left -= take;
        }
        balance -= qty;
      };
      const buy = (day: number, qty: number, emergency: boolean): Purchase => {
        const dayStart = istMidnight(day, ctx.now);
        const product = emergency ? null : rng.chance(0.2) && alternative ? alternative : preferred;
        if (product) {
          const packs = Math.max(product.moq, Math.ceil(qty / product.packSize));
          const price = packPrice(product, packs, day);
          const lead = Math.max(1, Math.ceil(product.leadTimeHours / 24));
          return {
            outlet, key, product, placedDay: day, placedAt: atIst(dayStart, 18, rng.int(0, 50)), arrivalDay: day - lead,
            arrivalAt: atIst(istMidnight(day - lead, ctx.now), 9, rng.int(0, 40)), packs, packPrice: price, baseQty: packs * product.packSize,
            unitCost: price / product.packSize, emergency: false,
          };
        }
        const base = (preferred ? packPrice(preferred, 1, day) / preferred.packSize : def.cost * (1 - 0.0005 * day)) * (emergency ? 1.12 : rng.float(0.97, 1.03));
        const unit = def.unit === 'PCS' ? 50 : 1;
        const baseQty = Math.ceil(qty / unit) * unit;
        return {
          outlet, key, product: null, placedDay: day, placedAt: atIst(dayStart, emergency ? 11 : 18, rng.int(0, 50)),
          arrivalDay: emergency ? day : day - def.leadTimeDays, arrivalAt: atIst(istMidnight(emergency ? day : day - def.leadTimeDays, ctx.now), emergency ? 12 : 9, rng.int(0, 40)),
          packs: baseQty, packPrice: r2(base), baseQty, unitCost: base, emergency,
        };
      };

      // opening stock, received the morning before the history window
      const opening = buy(HISTORY_DAYS + 1, maxStock * rng.float(0.6, 0.95), false);
      opening.product = null;
      opening.arrivalDay = HISTORY_DAYS + 1;
      opening.arrivalAt = atIst(istMidnight(HISTORY_DAYS + 1, ctx.now), 9);
      receive(opening, 'Opening stock', null, null);

      for (let day = HISTORY_DAYS; day >= 1; day--) {
        const dayStart = istMidnight(day, ctx.now);
        if (pending && pending.arrivalDay === day) {
          purchases.push(pending);
          receive(pending, pending.product ? `Purchase from ${sellerDef(pending.product.seller).name}` : 'Local market purchase', null, null);
          pending = null;
        }
        const used = daily.get(day)?.qty ?? 0;
        if (used > balance) {
          const top = buy(day, used - balance + avgDaily * 0.5, true);
          purchases.push(top);
          receive(top, 'Emergency local purchase', null, null);
        }
        let wasted = 0;
        if (used > 0) {
          consume(used);
          movementRows.push({
            tenantId: outlet.tenantId, outletId: outlet.id, ingredientId, type: 'CONSUMPTION', quantity: -r3(used), unitCost: r2(wac * 100) / 100,
            totalCost: r2(used * wac), balanceAfter: r3(balance), referenceType: 'DAILY_ROLLUP', reason: 'Order consumption (daily roll-up)', createdAt: atIst(dayStart, 23, 15),
          });
        }
        const endOfDay = atIst(dayStart, 23, 59);
        for (const b of batches) {
          if (b.remaining > 1e-9 && b.expiresAt <= endOfDay) {
            wasted += b.remaining;
            balance -= b.remaining;
            b.remaining = 0;
          }
        }
        if (wasted > 1e-6) {
          movementRows.push({
            tenantId: outlet.tenantId, outletId: outlet.id, ingredientId, type: 'WASTAGE', quantity: -r3(wasted), unitCost: r2(wac * 100) / 100,
            totalCost: r2(wasted * wac), balanceAfter: r3(balance), referenceType: 'EXPIRY', reason: 'Expired batch written off', createdAt: atIst(dayStart, 23, 45),
          });
        }
        if (used > 0 || wasted > 0) {
          consumptionRows.push({
            tenantId: outlet.tenantId, outletId: outlet.id, ingredientId, date: istDay(dayStart), consumedQty: r3(used), wastedQty: r3(wasted), ordersCount: daily.get(day)?.orders ?? 0,
          });
        }
        const suppressed = isLow && day <= lowWindow;
        // On the last simulated night the engine also reorders items forecast
        // to cross their reorder level within ~1.5 days (depletion prediction).
        const trigger = day === 1 ? reorderLevel + avgDaily * (leadDays >= 2 ? 4 : 1.5) : reorderLevel;
        if (!pending && !suppressed && balance <= trigger) {
          pending = buy(day, maxStock - balance + avgDaily * leadDays, false);
        }
      }

      const inFlight = !!pending;
      if (pending) purchases.push(pending); // arrives today or later: an open PO
      balance = Math.max(0, balance);
      costs.set(key, wac);

      ingredientRows.push({
        id: ingredientId, tenantId: outlet.tenantId, outletId: outlet.id, name: def.name, sku: `ING-${key.toUpperCase().replace(/_/g, '-')}`,
        category: def.category, unit: def.unit, currentStock: r3(balance), reorderLevel: r3(reorderLevel), reorderQty: r3(avgDaily * coverDays),
        safetyStock: r3(safety), maxStock: r3(maxStock), avgUnitCost: Math.round(wac * 10_000) / 10_000, lastPurchasePrice: Math.round(lastPrice * 10_000) / 10_000,
        shelfLifeDays: def.shelfLifeDays, storageType: def.storage, isPerishable: perishable, leadTimeDays: leadDays,
        preferredSupplierId: preferred ? ctx.sellers.get(preferred.seller)!.id : null, marketplaceCategory: MARKETPLACE_CATEGORY[def.category] ?? null,
        marketplaceProductId: preferred?.id ?? null, createdAt: istMidnight(HISTORY_DAYS + 2, ctx.now),
      });
      for (const b of batches) {
        const p = b.purchase;
        const row: Prisma.StockBatchCreateManyInput = {
          id: b.id, tenantId: outlet.tenantId, ingredientId, batchNumber: `B${b.receivedAt.toISOString().slice(2, 10).replace(/-/g, '')}-${randomBytes(2).toString('hex').toUpperCase()}`,
          quantity: r3(b.qty), remainingQty: r3(Math.max(0, b.remaining)), unitCost: Math.round(b.unitCost * 10_000) / 10_000, receivedAt: b.receivedAt,
          expiresAt: b.expiresAt, supplierTenantId: p?.product ? ctx.sellers.get(p.product.seller)!.id : null, createdAt: b.receivedAt,
        };
        batchRows.push(row);
        if (p) p.batch = row;
      }
      if (balance <= reorderLevel) lowStock.push({ outlet, key, ingredientId, balance, reorderLevel, avgDaily, maxStock, leadDays, product: preferred, inFlight });
    }
  }

  // ── purchase orders & B2B orders for recent purchases ────────────────────
  const po = await buildPurchaseOrders(ctx, purchases.filter((p) => p.product && !p.emergency && p.placedDay <= ORDER_DAYS), rng);
  // link receipts to their POs
  for (const p of purchases) {
    if (!p.poId) continue;
    if (p.movement) {
      p.movement.referenceType = 'PURCHASE_ORDER';
      p.movement.referenceId = p.poId;
      p.movement.reason = `PO ${po.numbers.get(p.poId)}`;
    }
    if (p.batch) p.batch.purchaseOrderId = p.poId;
  }

  await prisma.ingredient.createMany({ data: ingredientRows });
  await inChunks(batchRows, 2000, (c) => prisma.stockBatch.createMany({ data: c }));
  await inChunks(movementRows, 3000, (c) => prisma.stockMovement.createMany({ data: c }));
  await inChunks(consumptionRows, 3000, (c) => prisma.consumptionDaily.createMany({ data: c }));
  log('ingredients', `${ingredientRows.length} across ${ctx.outlets.length} outlets`);
  log('stock ledger', `${batchRows.length} batches, ${movementRows.length} movements, ${consumptionRows.length} daily consumption rows (${HISTORY_DAYS} days)`);

  await po.persist();
  await seedRecipes(ctx, unitCost);
  await seedProcurementState(ctx, lowStock);
  return { unitCost };
}

// ─────────────────────────────────────────────────────────────────────────────

async function buildPurchaseOrders(ctx: SeedContext, list: Purchase[], rng: Rng) {
  const groups = new Map<string, Purchase[]>();
  for (const p of list) {
    const k = `${p.outlet.id}|${p.placedDay}|${p.product!.seller}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const numbers = new Map<string, string>();
  const ops: (() => Promise<unknown>)[] = [];
  const sellerStats = new Map<SellerKey, { orders: number; ratings: number[]; onTime: number; delivered: number }>();
  const supplierDaily = new Map<string, { tenantId: string; date: Date; orders: number; gmv: number; units: number; delivered: number; onTime: number }>();

  for (const group of [...groups.values()].sort((a, b) => a[0]!.placedAt.getTime() - b[0]!.placedAt.getTime())) {
    const first = group[0]!;
    const outlet = first.outlet;
    const sellerKey = first.product!.seller;
    const seller = ctx.sellers.get(sellerKey)!;
    const sdef = sellerDef(sellerKey);
    const buyer = ctx.merchants.get(outlet.merchant.key)!;
    const poId = id();
    const b2bId = id();
    const poNumber = ctx.docNumber('PO', first.placedAt);
    numbers.set(poId, poNumber);
    for (const p of group) p.poId = poId;

    const lines = group.map((p) => {
      const lineTotal = r2(p.packs * p.packPrice);
      return { p, lineTotal, tax: r2((lineTotal * p.product!.gstRate) / 100) };
    });
    const subtotal = r2(lines.reduce((s, l) => s + l.lineTotal, 0));
    const taxTotal = r2(lines.reduce((s, l) => s + l.tax, 0));
    const deliveryCharge = sdef.zone.freeDeliveryAbove !== null && subtotal >= sdef.zone.freeDeliveryAbove ? 0 : sdef.zone.deliveryCharge;
    const total = r2(subtotal + taxTotal + deliveryCharge);
    const threshold = autoApproveLimit(outlet.merchant.key);
    const needsApproval = total > threshold;
    const approvedAt = needsApproval ? addMinutes(first.placedAt, rng.int(20, 120)) : first.placedAt;
    const sentAt = addMinutes(approvedAt, 1);
    const confirmedAt = addMinutes(sentAt, rng.int(25, 160));
    // A late delivery is one that missed the promised (earlier) morning slot.
    const late = !rng.chance(sdef.onTimeRate);
    const arrivalDayStart = istMidnight(first.arrivalDay, ctx.now);
    const expected = atIst(arrivalDayStart, late ? 7 : 10);
    const arrived = first.arrivalDay >= 1; // received into stock (GRN done)
    const deliveredToday = first.arrivalDay === 0 && first.arrivalAt < ctx.now; // delivered, GRN pending
    const deliveredAt = arrived || deliveredToday ? addMinutes(first.arrivalAt, -rng.int(5, 30)) : null;
    const dispatchedAt = deliveredAt
      ? addMinutes(deliveredAt, -rng.int(60, 120))
      : first.arrivalAt.getTime() - ctx.now.getTime() < 150 * 60_000
        ? addMinutes(ctx.now, -rng.int(10, 60))
        : null;
    const poStatus = arrived ? 'RECEIVED' : deliveredToday ? 'DELIVERED' : dispatchedAt ? 'DISPATCHED' : 'CONFIRMED';
    const b2bStatus = deliveredAt ? 'DELIVERED' : dispatchedAt ? 'DISPATCHED' : 'CONFIRMED';
    const terms = sellerKey === 'annapurna' && outlet.merchant.key === 'spicegarden' ? 'NET_7' : 'PREPAID';
    const address = { line1: outlet.def.addressLine1, city: outlet.locality.city, state: outlet.locality.state, pincode: outlet.locality.pincode, lat: outlet.lat, lng: outlet.lng, contactName: outlet.def.name, contactPhone: outlet.merchant.owner.phone };
    const tracking = dispatchedAt ? { vehicleNumber: `KA-0${rng.int(1, 5)}-${rng.pick(['AB', 'MN', 'TR'])}-${rng.digits(4)}`, driverName: rng.pick(['Raju', 'Siddappa', 'Naveen', 'Babu']), driverPhone: `+9190080${rng.digits(5)}`, eta: expected.toISOString() } : null;

    const poEvents: Prisma.PurchaseOrderEventCreateManyPurchaseOrderInput[] = [];
    const ev = (status: string, at: Date | null, note: string, actorType = 'SYSTEM') => {
      if (at) poEvents.push({ status: status as never, note, actorType, createdAt: at });
    };
    if (needsApproval) ev('PENDING_APPROVAL', first.placedAt, `Auto-generated from reorder alerts; awaiting approval (total ₹${total})`);
    ev('APPROVED', approvedAt, needsApproval ? 'Approved by owner' : 'Auto-approved below threshold', needsApproval ? 'MERCHANT' : 'SYSTEM');
    ev('SENT_TO_SUPPLIER', sentAt, `Sent to ${seller.name}`);
    ev('CONFIRMED', confirmedAt, 'Supplier confirmed all lines', 'SUPPLIER');
    ev('DISPATCHED', dispatchedAt, 'Out for delivery', 'SUPPLIER');
    ev('DELIVERED', deliveredAt, 'Delivered at outlet', 'SUPPLIER');
    if (arrived) ev('RECEIVED', addMinutes(deliveredAt!, 10), 'Goods received into stock', 'MERCHANT');

    ops.push(() =>
      ctx.prisma.purchaseOrder.create({
        data: {
          id: poId, poNumber, tenantId: outlet.tenantId, outletId: outlet.id, supplierTenantId: seller.id, supplierName: seller.name, status: poStatus as never,
          source: rng.chance(0.75) ? 'AUTO_REORDER' : 'MANUAL', strategy: 'BALANCED', subtotal, taxTotal, deliveryCharge, total, paymentTerms: terms,
          expectedDeliveryAt: expected, deliveryAddress: address, createdBy: buyer.ownerUserId, submittedAt: first.placedAt, approvedAt,
          approvedBy: needsApproval ? buyer.ownerUserId : null, sentAt, supplierOrderId: b2bId, supplierConfirmedAt: confirmedAt,
          dispatchedAt, deliveredAt, receivedAt: arrived ? addMinutes(deliveredAt!, 10) : null, receivedBy: arrived ? buyer.ownerUserId : null,
          trackingInfo: tracking ?? undefined, createdAt: first.placedAt,
          items: {
            create: lines.map(({ p, lineTotal, tax }) => ({
              ingredientId: p.outlet.ingredientIds.get(p.key)!, productId: p.product!.id, name: p.product!.name, sku: p.product!.sku, quantity: p.packs,
              unit: `${p.product!.packSize} ${p.product!.unit}`, unitPrice: p.packPrice, gstRate: p.product!.gstRate, taxAmount: tax, lineTotal,
              baseQtyPerPack: p.product!.packSize, ingredientUnit: INGREDIENTS[p.key]!.unit, confirmedQty: p.packs, receivedQty: arrived ? p.packs : 0,
            })),
          },
          approvals: needsApproval ? { create: { approverId: buyer.ownerUserId, decision: 'APPROVED', comment: 'OK', decidedAt: approvedAt } } : undefined,
          events: { createMany: { data: poEvents } },
        },
      }),
    );

    const soNumber = ctx.docNumber('SO', sentAt);
    const paid = terms === 'PREPAID' || (deliveredAt && deliveredAt.getTime() < ctx.now.getTime() - 7 * 86_400_000);
    const b2bEvents: Prisma.B2bOrderEventCreateManyOrderInput[] = [{ status: 'PLACED', note: `From ${poNumber}`, createdAt: sentAt }, { status: 'CONFIRMED', createdAt: confirmedAt }];
    if (dispatchedAt) b2bEvents.push({ status: 'PACKED', createdAt: addMinutes(dispatchedAt, -45) }, { status: 'DISPATCHED', createdAt: dispatchedAt });
    if (deliveredAt) b2bEvents.push({ status: 'DELIVERED', createdAt: deliveredAt, lat: outlet.lat, lng: outlet.lng });
    ops.push(() =>
      ctx.prisma.b2bOrder.create({
        data: {
          id: b2bId, orderNumber: soNumber, buyerTenantId: buyer.id, buyerName: buyer.name, sellerTenantId: seller.id, sellerName: seller.name,
          sourcePurchaseOrderId: poId, status: b2bStatus as never, subtotal, taxTotal, deliveryCharge, total, paymentTerms: terms,
          paymentStatus: paid ? 'PAID' : 'PENDING', deliveryDate: istDay(expected), deliveryAddress: address, expectedDeliveryAt: expected,
          trackingInfo: tracking ?? undefined, confirmedAt, packedAt: dispatchedAt ? addMinutes(dispatchedAt, -45) : null, dispatchedAt, deliveredAt, createdAt: sentAt,
          items: {
            create: lines.map(({ p, lineTotal, tax }) => ({
              productId: p.product!.id, name: p.product!.name, sku: p.product!.sku, quantity: p.packs, unit: `${p.product!.packSize} ${p.product!.unit}`,
              unitPrice: p.packPrice, gstRate: p.product!.gstRate, taxAmount: tax, lineTotal, confirmedQty: p.packs,
            })),
          },
          events: { createMany: { data: b2bEvents } },
        },
      }),
    );

    if (paid) {
      const paidAt = terms === 'PREPAID' ? addMinutes(sentAt, 4) : addMinutes(deliveredAt!, 6 * 1440);
      ops.push(() =>
        ctx.prisma.payment.create({
          data: {
            purpose: 'B2B_ORDER', referenceId: b2bId, userId: buyer.ownerUserId, tenantId: buyer.id, amount: total, method: 'NETBANKING', provider: 'RAZORPAY', state: 'CAPTURED',
            providerOrderId: `order_${randomBytes(7).toString('hex')}`, providerPaymentId: `pay_${randomBytes(7).toString('hex')}`, capturedAt: paidAt, createdAt: paidAt,
          },
        }),
      );
    }

    if (deliveredAt) {
      // seller GST invoice + marketplace settlement line (prepaid: 1% TCS)
      const taxable = r2(subtotal + deliveryCharge);
      const inter = isInterState(seller.stateCode, buyer.stateCode);
      const g = computeGst(taxable, taxable > 0 ? r2((taxTotal / taxable) * 100) : 0, inter);
      const invoiceNumber = ctx.docNumber('B2B', deliveredAt);
      ops.push(() =>
        ctx.prisma.gstInvoice.create({
          data: {
            invoiceNumber, type: 'B2B_SALE', referenceId: b2bId, tenantId: seller.id, supplierName: seller.legalName, supplierGstin: seller.gstin, supplierStateCode: seller.stateCode,
            recipientName: buyer.legalName, recipientGstin: buyer.gstin, placeOfSupply: buyer.stateCode, isInterState: inter, hsnSac: 'MULTI',
            taxableValue: g.taxableValue, cgst: g.cgst, sgst: g.sgst, igst: g.igst, total: g.total, issuedAt: deliveredAt,
          },
        }),
      );
      if (terms === 'PREPAID') {
        const rate = B2B_COMMISSION_PCT[sellerKey] ?? DEFAULT_B2B_COMMISSION_PCT;
        const commission = r2((taxable * rate) / 100);
        const commissionGst = r2(commission * 0.18);
        const tcs = r2(taxable * 0.01);
        const tds = r2(taxable * 0.001);
        ops.push(() =>
          ctx.prisma.settlementLine.create({
            data: {
              tenantId: seller.id, outletId: seller.id, orderId: b2bId, orderDate: deliveredAt, orderTotal: total, taxableValue: taxable, gstCollected: taxTotal,
              commission, commissionGst, tcs, tds, netAmount: r2(taxable - commission - commissionGst - tcs - tds + taxTotal), createdAt: deliveredAt,
            },
          }),
        );
      }
      const onTime = deliveredAt <= expected;
      const st = sellerStats.get(sellerKey) ?? { orders: 0, ratings: [], onTime: 0, delivered: 0 };
      st.delivered++;
      if (onTime) st.onTime++;
      if (rng.chance(0.5)) {
        const rating = onTime ? rng.weighted([5, 4, 3], [0.6, 0.32, 0.08]) : rng.weighted([4, 3, 2], [0.4, 0.4, 0.2]);
        st.ratings.push(rating);
        ops.push(() =>
          ctx.prisma.sellerRating.create({
            data: { b2bOrderId: b2bId, buyerTenantId: buyer.id, sellerTenantId: seller.id, rating, qualityRating: Math.min(5, rating + rng.int(0, 1)), onTime, comment: onTime ? null : 'Delivery was late', createdAt: addMinutes(deliveredAt, rng.int(60, 600)) },
          }),
        );
      }
      const dk = `${seller.id}|${istDay(deliveredAt).toISOString()}`;
      const d = supplierDaily.get(dk) ?? { tenantId: seller.id, date: istDay(deliveredAt), orders: 0, gmv: 0, units: 0, delivered: 0, onTime: 0 };
      d.delivered++;
      if (onTime) d.onTime++;
      supplierDaily.set(dk, d);
      sellerStats.set(sellerKey, st);
    }
    const st = sellerStats.get(sellerKey) ?? { orders: 0, ratings: [], onTime: 0, delivered: 0 };
    st.orders++;
    sellerStats.set(sellerKey, st);
    const pk = `${seller.id}|${istDay(sentAt).toISOString()}`;
    const pd = supplierDaily.get(pk) ?? { tenantId: seller.id, date: istDay(sentAt), orders: 0, gmv: 0, units: 0, delivered: 0, onTime: 0 };
    pd.orders++;
    pd.gmv = r2(pd.gmv + total);
    pd.units = r3(pd.units + group.reduce((s, p) => s + p.packs, 0));
    supplierDaily.set(pk, pd);
  }

  return {
    numbers,
    async persist() {
      for (const op of ops) await op();
      if (supplierDaily.size) {
        await ctx.prisma.dailySupplierStats.createMany({
          data: [...supplierDaily.values()].map((d) => ({ tenantId: d.tenantId, date: d.date, orders: d.orders, gmv: d.gmv, unitsSold: d.units, deliveredOrders: d.delivered, onTimeDeliveries: d.onTime })),
        });
      }
      for (const [key, st] of sellerStats) {
        const def = sellerDef(key);
        const n = st.ratings.length;
        await ctx.prisma.sellerMetrics.update({
          where: { tenantId: ctx.sellers.get(key)!.id },
          data: {
            totalOrders: st.orders, ratingCount: n, avgRating: n ? Math.round((st.ratings.reduce((s, r) => s + r, 0) / n) * 100) / 100 : def.rating,
            onTimeRate: st.delivered ? Math.round((st.onTime / st.delivered) * 1000) / 1000 : def.onTimeRate,
          },
        });
      }
      log('purchase orders → B2B orders', `${groups.size} POs in the last ${ORDER_DAYS} days`);
    },
  };
}

async function seedRecipes(ctx: SeedContext, unitCost: InventoryResult['unitCost']) {
  const snapshots: Prisma.CostSnapshotCreateManyInput[] = [];
  let recipes = 0;
  for (const outlet of ctx.outlets) {
    const costs = unitCost.get(outlet.id)!;
    for (const item of outlet.items) {
      await ctx.prisma.recipe.create({
        data: {
          tenantId: outlet.tenantId, outletId: outlet.id, menuItemId: item.id, name: item.name, yieldQty: 1, yieldUnit: 'PCS', prepTimeMins: outlet.def.avgPrepTimeMins,
          lines: { create: item.recipe.map(([key, qty]) => ({ ingredientId: outlet.ingredientIds.get(key)!, quantity: qty, unit: INGREDIENTS[key]!.unit })) },
        },
      });
      recipes++;
      const foodCost = item.recipe.reduce((s, [key, qty]) => s + qty * (costs.get(key) ?? 0), 0);
      const pct = r2((foodCost / item.price) * 100);
      for (let d = 13; d >= 0; d--) {
        snapshots.push({
          tenantId: outlet.tenantId, outletId: outlet.id, menuItemId: item.id, date: istDay(istMidnight(d, ctx.now)), sellingPrice: item.price,
          foodCost: Math.round(foodCost * (1 - d * 0.0004) * 10_000) / 10_000, foodCostPct: r2(pct * (1 - d * 0.0004)), marginPct: r2(100 - pct * (1 - d * 0.0004)),
        });
      }
    }
  }
  await inChunks(snapshots, 2000, (c) => ctx.prisma.costSnapshot.createMany({ data: c }));
  log('recipes & food-cost snapshots', `${recipes} recipes, ${snapshots.length} snapshots`);
}

async function seedProcurementState(
  ctx: SeedContext,
  low: { outlet: OutletRef; key: string; ingredientId: string; balance: number; reorderLevel: number; avgDaily: number; maxStock: number; leadDays: number; product: Product | null; inFlight: boolean }[],
) {
  for (const [key, m] of ctx.merchants) {
    await ctx.prisma.procurementSettings.create({
      data: { tenantId: m.id, autoPoEnabled: true, autoApproveBelow: autoApproveLimit(key), defaultStrategy: key === 'pizzarepublic' ? 'LOWEST_COST' : 'BALANCED', forecastHorizonDays: 14, serviceLevel: 0.95, reviewPeriodDays: 7 },
    });
  }

  const alerts: { id: string; row: (typeof low)[number] }[] = [];
  for (const row of low.filter((l) => !l.inFlight)) {
    const def = INGREDIENTS[row.key]!;
    const cover = row.avgDaily > 0 ? row.balance / row.avgDaily : 99;
    const severity = cover <= 1 ? 'CRITICAL' : cover <= 2 ? 'HIGH' : cover <= row.leadDays + 1 ? 'MEDIUM' : 'LOW';
    const alertId = id();
    alerts.push({ id: alertId, row });
    await ctx.prisma.reorderAlert.create({
      data: {
        id: alertId, tenantId: row.outlet.tenantId, outletId: row.outlet.id, ingredientId: row.ingredientId, ingredientName: def.name, category: def.category, unit: def.unit,
        currentStock: r3(row.balance), reorderLevel: r3(row.reorderLevel), avgDailyUsage: r3(row.avgDaily), daysOfCover: Math.round(cover * 10) / 10,
        predictedDepletionDate: new Date(ctx.now.getTime() + cover * 86_400_000), suggestedQty: r3(row.maxStock - row.balance), severity, createdAt: addMinutes(istMidnight(0, ctx.now), 6 * 60 + 5),
      },
    });
  }

  // tonight's auto-PO for Spice Garden Koramangala, waiting on the owner
  const sgk = ctx.outlets.find((o) => o.def.key === 'spicegarden-koramangala')!;
  const mine = alerts.filter((a) => a.row.outlet.id === sgk.id && a.row.product);
  const bySeller = new Map<SellerKey, typeof mine>();
  for (const a of mine) bySeller.set(a.row.product!.seller, [...(bySeller.get(a.row.product!.seller) ?? []), a]);
  const value = (g: typeof mine) => g.reduce((s, a) => s + (a.row.maxStock - a.row.balance) * (a.row.product!.price / a.row.product!.packSize), 0);
  const [sellerKey, group] = [...bySeller.entries()].sort((a, b) => value(b[1]) - value(a[1]))[0] ?? [];
  let poStatus: string | null = null;
  if (sellerKey && group) {
    const seller = ctx.sellers.get(sellerKey)!;
    const sdef = sellerDef(sellerKey);
    const tenant = ctx.merchants.get('spicegarden')!;
    const createdAt = addMinutes(istMidnight(0, ctx.now), 6 * 60 + 10);
    const lines = group.map((a) => {
      const p = a.row.product!;
      const packs = Math.max(p.moq, Math.ceil((a.row.maxStock - a.row.balance + a.row.avgDaily * a.row.leadDays) / p.packSize));
      const price = packPrice(p, packs, 0);
      const lineTotal = r2(packs * price);
      return { a, p, packs, price, lineTotal, tax: r2((lineTotal * p.gstRate) / 100) };
    });
    const subtotal = r2(lines.reduce((s, l) => s + l.lineTotal, 0));
    const taxTotal = r2(lines.reduce((s, l) => s + l.tax, 0));
    const deliveryCharge = sdef.zone.freeDeliveryAbove !== null && subtotal >= sdef.zone.freeDeliveryAbove ? 0 : sdef.zone.deliveryCharge;
    const total = r2(subtotal + taxTotal + deliveryCharge);
    const limit = autoApproveLimit('spicegarden');
    const status = total > limit ? 'PENDING_APPROVAL' : 'APPROVED';
    const po = await ctx.prisma.purchaseOrder.create({
      data: {
        poNumber: ctx.docNumber('PO', createdAt), tenantId: tenant.id, outletId: sgk.id, supplierTenantId: seller.id, supplierName: seller.name, status, source: 'AUTO_REORDER',
        strategy: 'BALANCED', subtotal, taxTotal, deliveryCharge, total, paymentTerms: 'NET_7', submittedAt: createdAt, approvedAt: status === 'APPROVED' ? createdAt : null,
        expectedDeliveryAt: atIst(istMidnight(-1, ctx.now), 10), notes: 'Generated by the smart procurement engine from open reorder alerts.',
        deliveryAddress: { line1: sgk.def.addressLine1, city: sgk.locality.city, state: sgk.locality.state, pincode: sgk.locality.pincode, lat: sgk.lat, lng: sgk.lng, contactName: sgk.def.name },
        createdAt,
        items: {
          create: lines.map((l) => ({
            ingredientId: l.a.row.ingredientId, productId: l.p.id, name: l.p.name, sku: l.p.sku, quantity: l.packs, unit: `${l.p.packSize} ${l.p.unit}`, unitPrice: l.price,
            gstRate: l.p.gstRate, taxAmount: l.tax, lineTotal: l.lineTotal, baseQtyPerPack: l.p.packSize, ingredientUnit: INGREDIENTS[l.a.row.key]!.unit,
          })),
        },
        events: { create: { status, note: status === 'PENDING_APPROVAL' ? `Total ₹${total} exceeds the ₹${limit} auto-approval limit` : 'Auto-approved below threshold', actorType: 'SYSTEM', createdAt } },
      },
    });
    poStatus = status;
    await ctx.prisma.reorderAlert.updateMany({ where: { id: { in: group.map((a) => a.id) } }, data: { status: 'PO_CREATED', purchaseOrderId: po.id } });

    // explainability: the ranked supplier comparison behind each line
    for (const l of lines) {
      const offers = ctx.products.filter((p) => p.ingredient === l.a.row.key && serviceable(p.seller, sgk));
      const needed = l.a.row.maxStock - l.a.row.balance;
      const scored = offers
        .map((p) => {
          const packs = Math.max(p.moq, Math.ceil(needed / p.packSize));
          const price = packPrice(p, packs, 0);
          const m = sellerDef(p.seller);
          const landed = r2(packs * price * (1 + p.gstRate / 100) + m.zone.deliveryCharge);
          return { p, packs, price, landed, m };
        })
        .sort((a, b) => a.landed - b.landed);
      const cheapest = scored[0]?.landed ?? 1;
      const ranked = scored
        .map((s) => ({ ...s, score: Math.round((0.5 * (cheapest / s.landed) + 0.2 * (24 / Math.max(24, s.p.leadTimeHours)) + 0.15 * (s.m.rating / 5) + 0.15 * s.m.onTimeRate) * 1000) / 1000 }))
        .sort((a, b) => b.score - a.score);
      await ctx.prisma.supplierQuote.createMany({
        data: ranked.map((s, i) => ({
          tenantId: tenant.id, ingredientId: l.a.row.ingredientId, productId: s.p.id, supplierTenantId: ctx.sellers.get(s.p.seller)!.id, supplierName: s.m.name,
          quantity: r3(s.packs * s.p.packSize), unitPrice: s.price, landedCost: s.landed, leadTimeHours: s.p.leadTimeHours, rating: s.m.rating, onTimeRate: s.m.onTimeRate,
          score: s.score, rank: i + 1, strategy: 'BALANCED', purchaseOrderId: s.p.id === l.p.id ? po.id : null, generatedAt: createdAt,
        })),
      });
    }
  }
  log('procurement', `${alerts.length} reorder alerts${poStatus ? `, 1 auto-PO (${poStatus}) at ${sgk.def.name}` : ''}`);
}
