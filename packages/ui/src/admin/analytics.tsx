'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { CategoryBarChart, Meter, TrendChart } from '../charts';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { DataTable, type Column } from '../components/data-table';
import { chartDays, DateRangePicker, useDateRange } from '../components/date-range';
import { FilterBar, PageHeader, StatGrid } from '../components/layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/menu';
import { StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import { api } from '../lib/api';
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatShortDate,
  humanize,
} from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';

interface Profitability {
  totals: {
    orders: number;
    gmv: number;
    netSales: number;
    discounts: number;
    commission: number;
    foodCost: number;
    grossProfit: number;
  };
  marginPct: number;
  foodCostPct: number;
  commissionPct: number;
  daily: {
    date: string;
    orders: number;
    netSales: number;
    commission: number;
    foodCost: number;
    grossProfit: number;
  }[];
  byOutlet: {
    outletId: string;
    outletName: string | null;
    orders: number;
    netSales: number;
    commission: number;
    foodCost: number;
    grossProfit: number;
    marginPct: number;
    foodCostPct: number;
  }[];
}
interface SupplierRow {
  tenantId: string;
  name: string | null;
  type: string | null;
  orders: number;
  gmv: number;
  fulfilmentRatePct: number;
  onTimeRatePct: number;
  rejectionRatePct: number;
}
interface RiderRow {
  riderId: string;
  name: string | null;
  deliveries: number;
  earnings: number;
  distanceKm: number;
  avgDeliveryMins: number;
  earningsPerDelivery: number;
}
interface Score {
  id: string;
  outletId: string;
  periodStart: string;
  periodEnd: string;
  score: number;
  grade: string;
  components: Record<string, number>;
  recommendations: string[];
}

/** Analytics dashboards: restaurant profitability, supplier sales, rider performance, retention, performance scores. */
export function PlatformAnalytics() {
  const { range, preset, setPreset } = useDateRange('30d');
  const q = { from: range.from, to: range.to };
  return (
    <>
      <PageHeader title="Analytics" description="Profitability, partners and customer retention" />
      <FilterBar>
        <DateRangePicker value={preset} onChange={setPreset} />
      </FilterBar>
      <Tabs defaultValue="restaurants">
        <TabsList className="flex-wrap">
          <TabsTrigger value="restaurants">Restaurant profitability</TabsTrigger>
          <TabsTrigger value="suppliers">Supplier sales</TabsTrigger>
          <TabsTrigger value="riders">Rider performance</TabsTrigger>
          <TabsTrigger value="retention">Customer retention</TabsTrigger>
          <TabsTrigger value="scores">Performance scores</TabsTrigger>
        </TabsList>
        <TabsContent value="restaurants">
          <Restaurants q={q} range={range} />
        </TabsContent>
        <TabsContent value="suppliers">
          <Suppliers q={q} />
        </TabsContent>
        <TabsContent value="riders">
          <Riders q={q} />
        </TabsContent>
        <TabsContent value="retention">
          <Retention />
        </TabsContent>
        <TabsContent value="scores">
          <Scores />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Restaurants({
  q,
  range,
}: {
  q: { from: string; to: string };
  range: ReturnType<typeof useDateRange>['range'];
}) {
  const r = useApi<Profitability>('analytics/platform/restaurant-profitability', q);
  const p = r.data;
  const daily = chartDays(p?.daily, range, {
    orders: 0,
    netSales: 0,
    commission: 0,
    foodCost: 0,
    grossProfit: 0,
  });
  const columns: Column<Profitability['byOutlet'][number]>[] = [
    {
      key: 'name',
      header: 'Outlet',
      sortValue: (o) => o.outletName,
      cell: (o) => <span className="font-medium">{o.outletName ?? o.outletId}</span>,
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      sortValue: (o) => o.orders,
      cell: (o) => formatNumber(o.orders),
    },
    {
      key: 'net',
      header: 'Net sales',
      align: 'right',
      sortValue: (o) => o.netSales,
      cell: (o) => formatMoney(o.netSales, { whole: true }),
    },
    {
      key: 'food',
      header: 'Food cost',
      align: 'right',
      sortValue: (o) => o.foodCostPct,
      cell: (o) => formatPercent(o.foodCostPct),
    },
    {
      key: 'comm',
      header: 'Commission',
      align: 'right',
      sortValue: (o) => o.commission,
      cell: (o) => formatMoney(o.commission, { whole: true }),
    },
    {
      key: 'gp',
      header: 'Gross profit',
      align: 'right',
      sortValue: (o) => o.grossProfit,
      cell: (o) => formatMoney(o.grossProfit, { whole: true }),
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      sortValue: (o) => o.marginPct,
      cell: (o) => formatPercent(o.marginPct),
    },
  ];
  return (
    <div className="grid gap-4">
      <StatGrid>
        <StatTile
          label="Restaurant net sales"
          value={p ? formatMoneyCompact(p.totals.netSales) : '—'}
        />
        <StatTile label="Gross profit" value={p ? formatMoneyCompact(p.totals.grossProfit) : '—'} />
        <StatTile label="Average margin" value={p ? formatPercent(p.marginPct) : '—'} />
        <StatTile label="Food cost" value={p ? formatPercent(p.foodCostPct) : '—'} />
      </StatGrid>
      <TrendChart
        title="Where restaurant sales went"
        description="Net sales split into gross profit, food cost and platform commission"
        data={daily}
        xKey="date"
        xFormat={(v) => formatShortDate(String(v))}
        series={[
          { key: 'grossProfit', label: 'Gross profit', slot: 1 },
          { key: 'foodCost', label: 'Food cost', slot: 2 },
          { key: 'commission', label: 'Commission', slot: 3 },
        ]}
        valueFormat={formatMoneyCompact}
        loading={r.isFetching}
      />
      <DataTable
        caption="Profitability by outlet"
        columns={columns}
        rows={p?.byOutlet}
        getRowId={(o) => o.outletId}
        loading={r.isLoading}
        fetching={r.isFetching}
      />
    </div>
  );
}

function Suppliers({ q }: { q: { from: string; to: string } }) {
  const r = useApi<SupplierRow[]>('analytics/platform/suppliers', q);
  const columns: Column<SupplierRow>[] = [
    {
      key: 'name',
      header: 'Seller',
      sortValue: (s) => s.name,
      cell: (s) => (
        <div>
          <p className="font-medium">{s.name ?? s.tenantId}</p>
          <p className="text-xs text-muted-foreground">{humanize(s.type)}</p>
        </div>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      sortValue: (s) => s.orders,
      cell: (s) => formatNumber(s.orders),
    },
    {
      key: 'gmv',
      header: 'Sales',
      align: 'right',
      sortValue: (s) => s.gmv,
      cell: (s) => formatMoney(s.gmv, { whole: true }),
    },
    {
      key: 'fill',
      header: 'Fulfilment',
      align: 'right',
      sortValue: (s) => s.fulfilmentRatePct,
      cell: (s) => formatPercent(s.fulfilmentRatePct),
    },
    {
      key: 'ontime',
      header: 'On time',
      align: 'right',
      sortValue: (s) => s.onTimeRatePct,
      cell: (s) => formatPercent(s.onTimeRatePct),
    },
    {
      key: 'reject',
      header: 'Rejected',
      align: 'right',
      sortValue: (s) => s.rejectionRatePct,
      cell: (s) => formatPercent(s.rejectionRatePct),
    },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <CategoryBarChart
        title="B2B sales by seller"
        data={r.data?.map((s) => ({
          name: s.name ?? s.tenantId.slice(0, 8),
          gmv: Math.round(s.gmv),
        }))}
        categoryKey="name"
        categoryLabel="Seller"
        series={[{ key: 'gmv', label: 'Sales' }]}
        valueFormat={formatMoneyCompact}
        layout="bars"
        loading={r.isFetching}
      />
      <DataTable
        caption="Supplier sales"
        columns={columns}
        rows={r.data}
        getRowId={(s) => s.tenantId}
        loading={r.isLoading}
        fetching={r.isFetching}
      />
    </div>
  );
}

function Riders({ q }: { q: { from: string; to: string } }) {
  const r = useApi<RiderRow[]>('analytics/platform/riders', q);
  const columns: Column<RiderRow>[] = [
    {
      key: 'name',
      header: 'Rider',
      sortValue: (x) => x.name,
      cell: (x) => <span className="font-medium">{x.name ?? x.riderId}</span>,
    },
    {
      key: 'del',
      header: 'Deliveries',
      align: 'right',
      sortValue: (x) => x.deliveries,
      cell: (x) => formatNumber(x.deliveries),
    },
    {
      key: 'mins',
      header: 'Avg time',
      align: 'right',
      sortValue: (x) => x.avgDeliveryMins,
      cell: (x) => `${formatNumber(x.avgDeliveryMins, { decimals: true })} min`,
    },
    {
      key: 'km',
      header: 'Distance',
      align: 'right',
      sortValue: (x) => x.distanceKm,
      cell: (x) => `${formatNumber(x.distanceKm)} km`,
    },
    {
      key: 'earn',
      header: 'Earnings',
      align: 'right',
      sortValue: (x) => x.earnings,
      cell: (x) => formatMoney(x.earnings, { whole: true }),
    },
    {
      key: 'per',
      header: 'Per delivery',
      align: 'right',
      sortValue: (x) => x.earningsPerDelivery,
      cell: (x) => formatMoney(x.earningsPerDelivery),
    },
  ];
  return (
    <DataTable
      caption="Rider performance"
      columns={columns}
      rows={r.data}
      getRowId={(x) => x.riderId}
      loading={r.isLoading}
      fetching={r.isFetching}
    />
  );
}

/** Cohort grid: share of each month's new customers who ordered again N months later. */
function Retention() {
  const r = useApi<{ cohort: string; size: number; retention: number[] }[]>(
    'analytics/platform/retention',
    { months: 6 },
  );
  const width = Math.max(1, ...(r.data ?? []).map((c) => c.retention.length));
  const shade = (pct: number) =>
    `color-mix(in oklab, var(--chart-1) ${Math.round(12 + pct * 0.88)}%, var(--chart-surface))`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly retention cohorts</CardTitle>
        <CardDescription>
          Customers grouped by the month of their first order; cells show the share who ordered in
          each later month
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="text-sm tabular">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 text-left font-medium">First order</th>
              <th className="py-2 pr-4 text-right font-medium">Customers</th>
              {Array.from({ length: width }, (_, i) => (
                <th key={i} className="px-1 py-2 text-center font-medium">
                  {i === 0 ? 'Month 0' : `+${i}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(r.data ?? []).map((c) => (
              <tr key={c.cohort}>
                <td className="py-1 pr-4">{formatDate(`${c.cohort}-01`).replace(/^1 /, '')}</td>
                <td className="py-1 pr-4 text-right">{formatNumber(c.size)}</td>
                {Array.from({ length: width }, (_, i) => {
                  const v = c.retention[i];
                  return (
                    <td key={i} className="p-0.5">
                      {v === undefined ? (
                        <span className="block h-9 w-16" />
                      ) : (
                        <span
                          className={`flex h-9 w-16 items-center justify-center rounded ${v > 55 ? 'text-white' : ''}`}
                          style={{ background: shade(v) }}
                          title={`${formatPercent(v)} of the ${c.cohort} cohort`}
                        >
                          {formatPercent(v, 0)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {r.data && !r.data.length ? (
          <p className="py-4 text-sm text-muted-foreground">Not enough order history yet.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Scores() {
  const [grade, setGrade] = React.useState('');
  const scores = useApi<Score[]>('admin/ai/outlet-scores', { grade: grade || undefined });
  const outlets = useApi<Profitability>('analytics/platform/restaurant-profitability');
  const name = (id: string) =>
    outlets.data?.byOutlet.find((o) => o.outletId === id)?.outletName ?? id.slice(0, 8);
  const run = useApiMutation(
    () => api.post<{ scored: number; periodEnd: string }>('analytics/platform/outlet-scores/run'),
    {
      invalidate: ['admin/ai/outlet-scores'],
      success: (r) =>
        `Scored ${r.scored} outlets for the week ending ${formatShortDate(r.periodEnd)}`,
    },
  );
  const latest = new Map<string, Score>();
  for (const s of scores.data ?? [])
    if (!latest.has(s.outletId) || latest.get(s.outletId)!.periodEnd < s.periodEnd)
      latest.set(s.outletId, s);
  const rows = [...latest.values()].sort((a, b) => b.score - a.score);
  return (
    <>
      <FilterBar>
        <select
          aria-label="Grade"
          className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="">All grades</option>
          {['A', 'B', 'C', 'D', 'E'].map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => run.mutate()}
          loading={run.isPending}
        >
          <RefreshCw /> Score last week now
        </Button>
      </FilterBar>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => (
          <Card key={s.id}>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{name(s.outletId)}</CardTitle>
                <CardDescription>
                  Week of {formatShortDate(s.periodStart)} – {formatShortDate(s.periodEnd)}
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold tabular">{Math.round(s.score)}</p>
                <StatusBadge
                  status={s.grade <= 'B' ? 'ACTIVE' : s.grade === 'C' ? 'PENDING' : 'HIGH'}
                  label={`Grade ${s.grade}`}
                />
              </div>
            </CardHeader>
            <CardContent className="grid gap-2">
              {Object.entries(s.components).map(([k, v]) => (
                <Meter key={k} label={humanize(k.replace(/([A-Z])/g, '_$1'))} value={v} max={100} />
              ))}
              {s.recommendations.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {s.recommendations.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {scores.data && !rows.length ? (
        <p className="text-sm text-muted-foreground">
          No scores yet. Outlets are scored every Monday for the previous week.
        </p>
      ) : null}
    </>
  );
}
