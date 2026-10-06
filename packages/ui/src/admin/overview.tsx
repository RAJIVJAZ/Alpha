'use client';

import Link from 'next/link';
import {
  BadgeCheck,
  IndianRupee,
  Percent,
  ShoppingBag,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react';
import { CategoryBarChart, TrendChart } from '../charts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import { chartDays, DateRangePicker, useDateRange } from '../components/date-range';
import { FilterBar, PageHeader, StatGrid } from '../components/layout';
import { StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatShortDate,
  humanize,
} from '../lib/format';
import { useApi } from '../lib/hooks';
import type { AdminStats, PlatformOverview } from './types';

const ROLE_GROUP: Record<string, string> = {
  CUSTOMER: 'Customers',
  RIDER: 'Riders',
  ADMIN: 'Admins',
  SUPPORT: 'Support staff',
  FINANCE: 'Finance staff',
  OPS: 'Operations staff',
};
const APPROVAL_LABEL: Record<string, string> = {
  TENANT: 'Business',
  RIDER: 'Rider',
  AD_CAMPAIGN: 'Ad campaign',
  OUTLET: 'Outlet',
};

interface TopOutlet {
  outletId: string;
  outletName: string | null;
  tenantName: string | null;
  city: string | null;
  orders: number;
  gmv: number;
  revenue: number;
  avgPrep: number | null;
}

/** Platform home: GMV, revenue, orders, customers and what needs an operator. */
export function AdminOverview({ approvalsHref }: { approvalsHref: string }) {
  const { range, preset, setPreset } = useDateRange('30d');
  const q = { from: range.from, to: range.to };
  const overview = useApi<PlatformOverview>('analytics/platform/overview', q);
  const stats = useApi<AdminStats>('admin/stats');
  const top = useApi<TopOutlet[]>('analytics/platform/top-outlets', q);
  const cities = useApi<{ city: string; orders: number; gmv: number; revenue: number }[]>(
    'analytics/platform/cities',
    q,
  );
  const k = overview.data?.kpis;
  const ch = overview.data?.change;
  const daily = chartDays(overview.data?.daily, range, {
    gmv: 0,
    revenue: 0,
    orders: 0,
    newCustomers: 0,
  });
  const vs = 'vs previous period';
  const pending = Object.entries(stats.data?.pendingApprovals ?? {});

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Consumer orders and the B2B marketplace across all cities"
      />
      <FilterBar>
        <DateRangePicker value={preset} onChange={setPreset} />
      </FilterBar>
      <StatGrid>
        <StatTile
          label="GMV"
          icon={<IndianRupee />}
          value={k ? formatMoneyCompact(k.gmv) : '—'}
          delta={ch ? { pct: ch.gmvPct, label: vs } : undefined}
          trend={daily?.slice(-14).map((d) => d.gmv)}
        />
        <StatTile
          label="Platform revenue"
          icon={<Percent />}
          value={k ? formatMoneyCompact(k.revenue) : '—'}
          delta={ch ? { pct: ch.revenuePct, label: vs } : undefined}
        />
        <StatTile
          label="Orders"
          icon={<ShoppingBag />}
          value={k ? formatNumber(k.orders) : '—'}
          delta={ch ? { pct: ch.ordersPct, label: vs } : undefined}
        />
        <StatTile
          label="Active customers"
          icon={<Users />}
          value={k ? formatNumber(k.activeCustomers) : '—'}
        />
      </StatGrid>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {k ? (
          <>
            <span>Take rate {formatPercent(k.takeRatePct)}</span>
            <span>AOV {formatMoney(k.averageOrderValue, { whole: true })}</span>
            <span>Cancellations {formatPercent(k.cancellationRatePct)}</span>
            <span>
              <UserPlus className="mr-1 inline size-4" aria-hidden />
              {formatNumber(k.newCustomers)} new customers
            </span>
            <span>
              <Truck className="mr-1 inline size-4" aria-hidden />
              {formatNumber(k.deliveries)} deliveries
            </span>
            <span>
              B2B {formatMoneyCompact(k.b2bGmv)} across {formatNumber(k.b2bOrders)} orders
            </span>
          </>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <TrendChart
          className="lg:col-span-2"
          title="GMV per day"
          description="Consumer orders, incl. taxes and fees"
          data={daily}
          xKey="date"
          xFormat={(v) => formatShortDate(String(v))}
          series={[{ key: 'gmv', label: 'GMV' }]}
          kind="area"
          valueFormat={formatMoneyCompact}
          loading={overview.isFetching}
        />
        <Card>
          <CardHeader>
            <CardTitle>Waiting on operations</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {pending.length ? (
              pending.map(([type, n]) => (
                <Link
                  key={type}
                  href={`${approvalsHref}?type=${type}`}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <BadgeCheck className="size-4" aria-hidden />
                    {APPROVAL_LABEL[type] ?? humanize(type)} approvals
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular">{n}</span>
                    <StatusBadge status="PENDING" />
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-muted-foreground">No pending approvals.</p>
            )}
            <div className="mt-2 grid gap-1 border-t pt-3">
              {Object.entries(stats.data?.usersByRole ?? {})
                .sort((a, b) => b[1] - a[1])
                .map(([role, n]) => (
                  <div key={role} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {ROLE_GROUP[role] ?? humanize(role)}
                    </span>
                    <span className="tabular">{formatNumber(n)}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Platform revenue per day"
          description="Commission, delivery and platform fees, before GST"
          data={daily}
          xKey="date"
          xFormat={(v) => formatShortDate(String(v))}
          series={[{ key: 'revenue', label: 'Revenue' }]}
          valueFormat={formatMoneyCompact}
          loading={overview.isFetching}
        />
        <TrendChart
          title="New customers per day"
          data={daily}
          xKey="date"
          xFormat={(v) => formatShortDate(String(v))}
          series={[{ key: 'newCustomers', label: 'New customers' }]}
          integer
          loading={overview.isFetching}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CategoryBarChart
          title="Top restaurants by GMV"
          data={top.data?.map((t) => ({
            name: t.outletName ?? t.outletId.slice(0, 8),
            gmv: Math.round(t.gmv),
          }))}
          categoryKey="name"
          categoryLabel="Outlet"
          series={[{ key: 'gmv', label: 'GMV' }]}
          valueFormat={formatMoneyCompact}
          layout="bars"
          loading={top.isFetching}
        />
        <Card>
          <CardHeader>
            <CardTitle>Cities</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">City</th>
                  <th className="py-2 pr-3 text-right font-medium">Orders</th>
                  <th className="py-2 pr-3 text-right font-medium">GMV</th>
                  <th className="py-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {(cities.data ?? []).map((c) => (
                  <tr key={c.city} className="border-b last:border-0">
                    <td className="py-2 pr-3">{c.city}</td>
                    <td className="py-2 pr-3 text-right">{formatNumber(c.orders)}</td>
                    <td className="py-2 pr-3 text-right">{formatMoneyCompact(c.gmv)}</td>
                    <td className="py-2 text-right">{formatMoneyCompact(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
