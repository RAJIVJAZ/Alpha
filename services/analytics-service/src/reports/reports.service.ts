import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { istDate, round2 } from '@foodgrid/utils';
import { resolveRange } from '@foodgrid/utils/server';

type Range = { from?: string; to?: string };
const num = (v: unknown) => Number(v ?? 0);
const pct = (a: number, b: number) => (b ? round2((a / b) * 100) : 0);

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin: GMV, revenue, orders, AOV, customers — totals, previous-period delta and daily series. */
  async platformOverview(q: Range) {
    const { from, to } = resolveRange(q, 30);
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const [days, prev, b2b] = await Promise.all([
      this.prisma.dailyPlatformStats.findMany({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.dailyPlatformStats.aggregate({
        where: { date: { gte: prevFrom, lt: from } },
        _sum: { gmv: true, revenue: true, orders: true },
      }),
      this.prisma.dailySupplierStats.aggregate({
        where: { date: { gte: from, lte: to } },
        _sum: { gmv: true, orders: true },
      }),
    ]);
    const sum = (
      k: 'gmv' | 'revenue' | 'orders' | 'cancelledOrders' | 'newCustomers' | 'deliveries',
    ) => days.reduce((s, d) => s + num(d[k]), 0);
    const gmv = round2(sum('gmv'));
    const orders = sum('orders');
    const uniqueCustomers = await this.prisma.orderFact.findMany({
      where: {
        date: { gte: from, lte: to },
        status: { in: ['DELIVERED', 'COMPLETED'] },
        customerId: { not: null },
      },
      distinct: ['customerId'],
      select: { customerId: true },
    });
    return {
      from,
      to,
      kpis: {
        gmv,
        revenue: round2(sum('revenue')),
        takeRatePct: pct(sum('revenue'), gmv),
        orders,
        averageOrderValue: orders ? round2(gmv / orders) : 0,
        cancellationRatePct: pct(sum('cancelledOrders'), orders + sum('cancelledOrders')),
        activeCustomers: uniqueCustomers.length,
        newCustomers: sum('newCustomers'),
        deliveries: sum('deliveries'),
        b2bGmv: round2(num(b2b._sum.gmv)),
        b2bOrders: num(b2b._sum.orders),
      },
      change: {
        gmvPct: pct(gmv - num(prev._sum.gmv), num(prev._sum.gmv)),
        revenuePct: pct(sum('revenue') - num(prev._sum.revenue), num(prev._sum.revenue)),
        ordersPct: pct(orders - num(prev._sum.orders), num(prev._sum.orders)),
      },
      daily: days.map((d) => ({
        date: d.date.toISOString().slice(0, 10),
        gmv: num(d.gmv),
        revenue: num(d.revenue),
        orders: d.orders,
        newCustomers: d.newCustomers,
      })),
    };
  }

  /** Monthly acquisition cohorts and the share still ordering N months later. */
  async retention(months = 6) {
    // first day of the IST month `months - 1` months back (cohorts are IST calendar months)
    const [y, m] = istDate().split('-').map(Number) as [number, number];
    const since = new Date(Date.UTC(y, m - months, 1));
    const rows = await this.prisma.$queryRaw<{ cohort: string; offset: number; users: bigint }[]>`
      WITH firsts AS (
        SELECT "customerId", date_trunc('month', MIN(date)) AS cohort
        FROM "analytics"."OrderFact"
        WHERE status IN ('DELIVERED','COMPLETED') AND "customerId" IS NOT NULL
        GROUP BY 1
      ), activity AS (
        SELECT DISTINCT "customerId", date_trunc('month', date) AS month
        FROM "analytics"."OrderFact"
        WHERE status IN ('DELIVERED','COMPLETED') AND "customerId" IS NOT NULL
      )
      SELECT to_char(f.cohort, 'YYYY-MM') AS cohort,
             ((EXTRACT(year FROM a.month) - EXTRACT(year FROM f.cohort)) * 12 + EXTRACT(month FROM a.month) - EXTRACT(month FROM f.cohort))::int AS offset,
             COUNT(DISTINCT a."customerId") AS users
      FROM firsts f JOIN activity a USING ("customerId")
      WHERE f.cohort >= ${since}
      GROUP BY 1, 2 ORDER BY 1, 2`;
    const cohorts = new Map<string, number[]>();
    for (const r of rows) {
      const list = cohorts.get(r.cohort) ?? [];
      list[r.offset] = Number(r.users);
      cohorts.set(r.cohort, list);
    }
    return [...cohorts.entries()].map(([cohort, counts]) => {
      const size = counts[0] ?? 0;
      return { cohort, size, retention: counts.map((c) => pct(c ?? 0, size)) };
    });
  }

  async topOutlets(q: Range & { limit?: number; city?: string }) {
    const { from, to } = resolveRange(q, 30);
    const rows = await this.prisma.$queryRaw<
      {
        outletId: string;
        tenantId: string;
        city: string | null;
        orders: bigint;
        gmv: unknown;
        revenue: unknown;
        avgPrep: number | null;
      }[]
    >`
      SELECT "outletId", MAX("tenantId") AS "tenantId", MAX(city) AS city, COUNT(*) AS orders, SUM(gmv) AS gmv,
             SUM("platformRevenue") AS revenue, AVG("prepMins") AS "avgPrep"
      FROM "analytics"."OrderFact"
      WHERE date BETWEEN ${from}::date AND ${to}::date AND status IN ('DELIVERED','COMPLETED')
        AND (${q.city ?? null}::text IS NULL OR city = ${q.city ?? null})
      GROUP BY "outletId" ORDER BY SUM(gmv) DESC LIMIT ${Math.min(100, Number(q.limit) || 20)}`;
    return rows.map((r) => ({
      ...r,
      orders: Number(r.orders),
      gmv: round2(num(r.gmv)),
      revenue: round2(num(r.revenue)),
      avgPrep: r.avgPrep ? round2(r.avgPrep) : null,
    }));
  }

  async cities(q: Range) {
    const { from, to } = resolveRange(q, 30);
    const rows = await this.prisma.orderFact.groupBy({
      by: ['city'],
      where: { date: { gte: from, lte: to }, status: { in: ['DELIVERED', 'COMPLETED'] } },
      _sum: { gmv: true, platformRevenue: true },
      _count: { _all: true },
      orderBy: { _sum: { gmv: 'desc' } },
    });
    return rows.map((r) => ({
      city: r.city,
      orders: r._count._all,
      gmv: num(r._sum.gmv),
      revenue: num(r._sum.platformRevenue),
    }));
  }

  /** Restaurant profitability: net sales − commission − food cost. */
  async profitability(q: Range & { outletId?: string; tenantId?: string }) {
    const { from, to } = resolveRange(q, 30);
    const days = await this.prisma.dailyOutletStats.findMany({
      where: { date: { gte: from, lte: to }, outletId: q.outletId, tenantId: q.tenantId },
      orderBy: { date: 'asc' },
    });
    const totals = days.reduce(
      (acc, d) => ({
        orders: acc.orders + d.orders,
        gmv: acc.gmv + num(d.gmv),
        netSales: acc.netSales + num(d.netSales),
        discounts: acc.discounts + num(d.discounts),
        commission: acc.commission + num(d.commission),
        foodCost: acc.foodCost + num(d.foodCost),
        grossProfit: acc.grossProfit + num(d.grossProfit),
      }),
      { orders: 0, gmv: 0, netSales: 0, discounts: 0, commission: 0, foodCost: 0, grossProfit: 0 },
    );
    // one row per day across the outlets in scope, and one row per outlet
    const sumBy = (key: (d: (typeof days)[number]) => string) => {
      const map = new Map<
        string,
        {
          orders: number;
          netSales: number;
          commission: number;
          foodCost: number;
          grossProfit: number;
        }
      >();
      for (const d of days) {
        const k = key(d);
        const acc = map.get(k) ?? {
          orders: 0,
          netSales: 0,
          commission: 0,
          foodCost: 0,
          grossProfit: 0,
        };
        acc.orders += d.orders;
        acc.netSales += num(d.netSales);
        acc.commission += num(d.commission);
        acc.foodCost += num(d.foodCost);
        acc.grossProfit += num(d.grossProfit);
        map.set(k, acc);
      }
      return [...map.entries()].map(([k, v]) => ({
        k,
        orders: v.orders,
        netSales: round2(v.netSales),
        commission: round2(v.commission),
        foodCost: round2(v.foodCost),
        grossProfit: round2(v.grossProfit),
      }));
    };
    const tenantOf = new Map(days.map((d) => [d.outletId, d.tenantId]));
    return {
      from,
      to,
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
      marginPct: pct(totals.grossProfit, totals.netSales),
      foodCostPct: pct(totals.foodCost, totals.netSales),
      commissionPct: pct(totals.commission, totals.netSales),
      daily: sumBy((d) => d.date.toISOString().slice(0, 10)).map(({ k, ...v }) => ({
        date: k,
        ...v,
      })),
      byOutlet: sumBy((d) => d.outletId)
        .map(({ k, ...v }) => ({
          outletId: k,
          tenantId: tenantOf.get(k)!,
          ...v,
          marginPct: pct(v.grossProfit, v.netSales),
          foodCostPct: pct(v.foodCost, v.netSales),
        }))
        .sort((a, b) => b.netSales - a.netSales),
    };
  }

  /** Daily sales report for a merchant outlet. */
  async outletSales(q: Range & { outletId?: string; tenantId: string }) {
    const { from, to } = resolveRange(q, 30);
    const where = { tenantId: q.tenantId, outletId: q.outletId, date: { gte: from, lte: to } };
    const [days, byChannel, byPayment, hourly] = await Promise.all([
      this.prisma.dailyOutletStats.findMany({ where, orderBy: { date: 'asc' } }),
      this.prisma.orderFact.groupBy({
        by: ['channel'],
        where: { ...where, status: { in: ['DELIVERED', 'COMPLETED'] } },
        _sum: { gmv: true },
        _count: { _all: true },
      }),
      this.prisma.orderFact.groupBy({
        by: ['paymentMethod'],
        where: { ...where, status: { in: ['DELIVERED', 'COMPLETED'] } },
        _sum: { gmv: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ dow: number; hour: number; orders: bigint }[]>`
        SELECT EXTRACT(dow FROM date)::int AS dow, hour, COUNT(*) AS orders
        FROM "analytics"."OrderFact"
        WHERE "tenantId" = ${q.tenantId} AND (${q.outletId ?? null}::text IS NULL OR "outletId" = ${q.outletId ?? null})
          AND date BETWEEN ${from}::date AND ${to}::date AND status IN ('DELIVERED','COMPLETED')
        GROUP BY 1, 2`,
    ]);
    const orders = days.reduce((s, d) => s + d.orders, 0);
    const gmv = days.reduce((s, d) => s + num(d.gmv), 0);
    const cancelled = days.reduce((s, d) => s + d.cancelledOrders, 0);
    return {
      from,
      to,
      kpis: {
        orders,
        gmv: round2(gmv),
        netSales: round2(days.reduce((s, d) => s + num(d.netSales), 0)),
        averageOrderValue: orders ? round2(gmv / orders) : 0,
        cancellationRatePct: pct(cancelled, orders + cancelled),
        newCustomers: days.reduce((s, d) => s + d.newCustomers, 0),
        repeatCustomers: days.reduce((s, d) => s + d.repeatCustomers, 0),
      },
      daily: days.map((d) => ({
        date: d.date.toISOString().slice(0, 10),
        orders: d.orders,
        gmv: num(d.gmv),
        netSales: num(d.netSales),
        cancelled: d.cancelledOrders,
      })),
      byChannel: byChannel.map((c) => ({
        channel: c.channel,
        orders: c._count._all,
        gmv: num(c._sum.gmv),
      })),
      byPaymentMethod: byPayment.map((p) => ({
        method: p.paymentMethod ?? 'UNKNOWN',
        orders: p._count._all,
        gmv: num(p._sum.gmv),
      })),
      heatmap: hourly.map((h) => ({ dow: h.dow, hour: h.hour, orders: Number(h.orders) })),
    };
  }

  async riderPerformance(q: Range & { riderId?: string; limit?: number }) {
    const { from, to } = resolveRange(q, 7);
    const rows = await this.prisma.dailyRiderStats.groupBy({
      by: ['riderId'],
      where: { date: { gte: from, lte: to }, riderId: q.riderId },
      _sum: { deliveries: true, earnings: true, distanceKm: true, onlineMinutes: true },
      _avg: { avgDeliveryMins: true },
      orderBy: { _sum: { deliveries: 'desc' } },
      take: Math.min(200, Number(q.limit) || 50),
    });
    return rows.map((r) => ({
      riderId: r.riderId,
      deliveries: r._sum.deliveries ?? 0,
      earnings: round2(num(r._sum.earnings)),
      distanceKm: round2(num(r._sum.distanceKm)),
      avgDeliveryMins: r._avg.avgDeliveryMins ? round2(r._avg.avgDeliveryMins) : null,
      earningsPerDelivery: r._sum.deliveries ? round2(num(r._sum.earnings) / r._sum.deliveries) : 0,
    }));
  }

  async riderDaily(riderId: string, q: Range) {
    const { from, to } = resolveRange(q, 30);
    return this.prisma.dailyRiderStats.findMany({
      where: { riderId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
  }

  async supplierSales(q: Range & { tenantId?: string; limit?: number }) {
    const { from, to } = resolveRange(q, 30);
    if (q.tenantId) {
      const days = await this.prisma.dailySupplierStats.findMany({
        where: { tenantId: q.tenantId, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      });
      const delivered = days.reduce((s, d) => s + d.deliveredOrders, 0);
      return {
        orders: days.reduce((s, d) => s + d.orders, 0),
        gmv: round2(days.reduce((s, d) => s + num(d.gmv), 0)),
        onTimeRatePct: pct(
          days.reduce((s, d) => s + d.onTimeDeliveries, 0),
          delivered,
        ),
        daily: days.map((d) => ({
          date: d.date.toISOString().slice(0, 10),
          orders: d.orders,
          gmv: num(d.gmv),
          delivered: d.deliveredOrders,
        })),
      };
    }
    const rows = await this.prisma.dailySupplierStats.groupBy({
      by: ['tenantId'],
      where: { date: { gte: from, lte: to } },
      _sum: {
        orders: true,
        gmv: true,
        deliveredOrders: true,
        onTimeDeliveries: true,
        rejectedOrders: true,
      },
      orderBy: { _sum: { gmv: 'desc' } },
      take: Math.min(100, Number(q.limit) || 20),
    });
    return rows.map((r) => ({
      tenantId: r.tenantId,
      orders: r._sum.orders ?? 0,
      gmv: round2(num(r._sum.gmv)),
      fulfilmentRatePct: pct(r._sum.deliveredOrders ?? 0, r._sum.orders ?? 0),
      onTimeRatePct: pct(r._sum.onTimeDeliveries ?? 0, r._sum.deliveredOrders ?? 0),
      rejectionRatePct: pct(r._sum.rejectedOrders ?? 0, r._sum.orders ?? 0),
    }));
  }

  /** Inputs for the AI outlet-performance score (last 7 days). */
  async outletScoringMetrics(outletId: string, from: Date, to: Date) {
    const facts = await this.prisma.orderFact.findMany({
      where: { outletId, date: { gte: from, lte: to } },
    });
    const placed = facts.filter((f) => f.status !== 'PENDING_PAYMENT');
    const rejected = placed.filter((f) => f.status === 'REJECTED').length;
    const cancelled = placed.filter((f) => f.status === 'CANCELLED').length;
    const done = placed.filter((f) => ['DELIVERED', 'COMPLETED'].includes(f.status));
    const prep = done.map((f) => f.prepMins).filter((x): x is number => x != null);
    // on time = delivered by the ETA the customer was promised at checkout
    const promised = done.filter((f) => f.deliveryMins != null && f.promisedMins != null);
    const customers = new Map<string, number>();
    for (const f of done)
      if (f.customerId) customers.set(f.customerId, (customers.get(f.customerId) ?? 0) + 1);
    return {
      tenantId: facts[0]?.tenantId,
      orders: placed.length,
      acceptanceRate: placed.length ? 1 - rejected / placed.length : 1,
      cancellationRate: placed.length ? cancelled / placed.length : 0,
      avgPrepMins: prep.length ? prep.reduce((a, b) => a + b, 0) / prep.length : 20,
      onTimeRate: promised.length
        ? promised.filter((f) => f.deliveryMins! <= f.promisedMins!).length / promised.length
        : 1,
      repeatRate: customers.size
        ? [...customers.values()].filter((c) => c > 1).length / customers.size
        : 0,
    };
  }
}
