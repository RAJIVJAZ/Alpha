import { computeGst, sumMoney } from './helpers';
import type { SeedContext } from './context';
import { istWeekStart } from './delivery';
import { addMinutes, atIst, log, Rng } from './lib';

export async function seedCommissionRules(ctx: SeedContext) {
  const from = new Date(ctx.now.getTime() - 400 * 86_400_000);
  await ctx.prisma.commissionRule.createMany({
    data: [
      { name: 'Restaurants - standard', tenantType: 'RESTAURANT', ratePct: 18, effectiveFrom: from },
      { name: 'Food carts - standard', tenantType: 'FOOD_CART', ratePct: 10, effectiveFrom: from },
      { name: 'B2B marketplace sellers', tenantType: 'SUPPLIER', ratePct: 3, effectiveFrom: from },
      { name: 'Spice Garden - negotiated', tenantId: ctx.merchants.get('spicegarden')!.id, ratePct: 16, priority: 10, effectiveFrom: from },
      { name: 'Bharat Wholesale - volume tier', tenantId: ctx.sellers.get('bharat')!.id, ratePct: 2.5, priority: 10, effectiveFrom: from },
    ],
  });
  log('commission rules', 5);
}

/**
 * Runs the weekly settlement cycle over the seeded accruals exactly like
 * payment-service SettlementsService.run(): one settlement per tenant per
 * week, plus the platform's commission invoice. The latest week is left
 * PENDING for finance to pay out; earlier weeks are PAID.
 */
export async function seedSettlements(ctx: SeedContext) {
  const { prisma } = ctx;
  const rng = new Rng(31337);
  const thisWeek = istWeekStart(ctx.now);
  const names = new Map([...ctx.merchants.values(), ...ctx.sellers.values()].map((t) => [t.id, t]));
  let count = 0;
  for (let k = 5; k >= 1; k--) {
    const periodStart = new Date(thisWeek.getTime() - k * 7 * 86_400_000);
    const periodEnd = new Date(periodStart.getTime() + 7 * 86_400_000);
    const runAt = atIst(periodEnd, 3, 0);
    if (runAt > ctx.now) continue;
    const groups = await prisma.settlementLine.groupBy({ by: ['tenantId'], where: { settlementId: null, orderDate: { gte: periodStart, lt: periodEnd } } });
    for (const { tenantId } of groups) {
      const lines = await prisma.settlementLine.findMany({ where: { tenantId, settlementId: null, orderDate: { gte: periodStart, lt: periodEnd } } });
      const sum = (key: 'taxableValue' | 'merchantDiscount' | 'commission' | 'commissionGst' | 'tcs' | 'tds' | 'netAmount') => sumMoney(lines.map((l) => String(l[key])));
      const paid = k > 1;
      const paidAt = addMinutes(runAt, 2 * 1440 + 8 * 60);
      const s = await prisma.settlement.create({
        data: {
          tenantId, periodStart, periodEnd, ordersCount: lines.length, grossSales: sum('taxableValue'), merchantDiscounts: sum('merchantDiscount'),
          commission: sum('commission'), commissionGst: sum('commissionGst'), tcs: sum('tcs'), tds: sum('tds'), netPayable: sum('netAmount'),
          status: paid ? 'PAID' : 'PENDING', paidAt: paid ? paidAt : null, payoutReference: paid ? `UTR${rng.digits(12)}` : null, createdAt: runAt,
        },
      });
      await prisma.settlementLine.updateMany({ where: { id: { in: lines.map((l) => l.id) } }, data: { settlementId: s.id } });
      const tenant = names.get(tenantId);
      const commission = Number(s.commission);
      if (commission > 0) {
        const g = computeGst(commission, 18, tenant ? tenant.stateCode !== ctx.platform.stateCode : false);
        await prisma.gstInvoice.create({
          data: {
            invoiceNumber: ctx.docNumber('FGC', runAt), type: 'COMMISSION', referenceId: s.id, tenantId, supplierName: ctx.platform.legalName, supplierGstin: ctx.platform.gstin,
            supplierStateCode: ctx.platform.stateCode, recipientName: tenant?.legalName ?? null, recipientGstin: tenant?.gstin ?? null, placeOfSupply: tenant?.stateCode ?? ctx.platform.stateCode,
            isInterState: g.igst > 0, hsnSac: '998599', taxableValue: g.taxableValue, cgst: g.cgst, sgst: g.sgst, igst: g.igst, total: g.total, issuedAt: runAt,
          },
        });
      }
      count++;
    }
  }
  log('settlements', `${count} weekly settlements (latest week pending payout)`);
}

/** Recomputes the analytics read models from the seeded facts (same SQL as analytics-service). */
export async function seedAnalyticsAggregates(ctx: SeedContext) {
  const { prisma } = ctx;
  await prisma.$executeRaw`
    INSERT INTO "analytics"."DailyOutletStats"
      (id, date, "tenantId", "outletId", orders, "cancelledOrders", gmv, "netSales", discounts, commission,
       "foodCost", "grossProfit", "avgPrepMins", "newCustomers", "repeatCustomers", "updatedAt")
    SELECT gen_random_uuid()::text, f.date, MAX(f."tenantId"), f."outletId",
      COUNT(*) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')),
      COUNT(*) FILTER (WHERE f.status IN ('CANCELLED','REJECTED')),
      COALESCE(SUM(f.gmv) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
      COALESCE(SUM(f.subtotal - f.discount) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
      COALESCE(SUM(f.discount) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
      COALESCE(SUM(f.commission) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
      COALESCE(SUM(f."foodCost") FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
      COALESCE(SUM(f.subtotal - f.discount - f.commission - f."foodCost") FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
      AVG(f."prepMins") FILTER (WHERE f."prepMins" IS NOT NULL),
      COUNT(DISTINCT f."customerId") FILTER (WHERE f."isFirstOrder" AND f.status IN ('DELIVERED','COMPLETED')),
      COUNT(DISTINCT f."customerId") FILTER (WHERE NOT f."isFirstOrder" AND f.status IN ('DELIVERED','COMPLETED')),
      now()
    FROM "analytics"."OrderFact" f
    GROUP BY f."outletId", f.date`;

  await prisma.$executeRaw`
    INSERT INTO "analytics"."DailyPlatformStats"
      (date, gmv, revenue, orders, "cancelledOrders", "activeCustomers", "newCustomers", "activeOutlets", "activeRiders", deliveries, "updatedAt")
    SELECT date,
      COALESCE(SUM(gmv) FILTER (WHERE status IN ('DELIVERED','COMPLETED')), 0),
      COALESCE(SUM("platformRevenue") FILTER (WHERE status IN ('DELIVERED','COMPLETED')), 0),
      COUNT(*) FILTER (WHERE status IN ('DELIVERED','COMPLETED')),
      COUNT(*) FILTER (WHERE status IN ('CANCELLED','REJECTED')),
      COUNT(DISTINCT "customerId") FILTER (WHERE status IN ('DELIVERED','COMPLETED')),
      COUNT(DISTINCT "customerId") FILTER (WHERE "isFirstOrder"),
      COUNT(DISTINCT "outletId"),
      COUNT(DISTINCT "riderId"),
      COUNT(*) FILTER (WHERE status = 'DELIVERED' AND "orderType" = 'DELIVERY'),
      now()
    FROM "analytics"."OrderFact"
    GROUP BY date`;

  await prisma.$executeRaw`
    UPDATE "analytics"."DailyPlatformStats" p
    SET "b2bOrders" = b.orders, "b2bGmv" = b.gmv
    FROM (
      SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS date, COUNT(*)::int AS orders, SUM(total) AS gmv
      FROM "marketplace"."B2bOrder" GROUP BY 1
    ) b
    WHERE p.date = b.date`;
  const [outletDays, platformDays] = await Promise.all([prisma.dailyOutletStats.count(), prisma.dailyPlatformStats.count()]);
  log('analytics read models', `${outletDays} outlet-days, ${platformDays} platform-days`);
}
