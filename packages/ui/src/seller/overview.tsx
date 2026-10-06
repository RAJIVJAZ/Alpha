'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ClipboardList,
  IndianRupee,
  PackageCheck,
  ShoppingBag,
  Timer,
} from 'lucide-react';
import { CategoryBarChart, TrendChart } from '../charts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import { chartDays, DateRangePicker, useDateRange } from '../components/date-range';
import { FilterBar, PageHeader, StatGrid } from '../components/layout';
import { pctChange, StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatShortDate,
} from '../lib/format';
import { useApi } from '../lib/hooks';
import type { SellerSummary } from './types';

/** Seller home and analytics (supplier "analytics", retailer "retail analytics"). */
export function SellerOverview({
  title = 'Overview',
  links,
}: {
  title?: string;
  links: { orders: string; products: string };
}) {
  const { range, preset, setPreset } = useDateRange('30d');
  const cur = useApi<SellerSummary>('seller/analytics/summary', { from: range.from, to: range.to });
  const prev = useApi<SellerSummary>('seller/analytics/summary', {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const k = cur.data;
  const daily = chartDays(k?.daily, range, { orders: 0, gmv: 0 });
  const p = prev.data;
  const vs = 'vs previous period';

  return (
    <>
      <PageHeader
        title={title}
        description="B2B sales from restaurants, carts, retailers and dealers"
      />
      <FilterBar>
        <DateRangePicker value={preset} onChange={setPreset} />
      </FilterBar>
      <StatGrid>
        <StatTile
          label="Sales (GMV)"
          icon={<IndianRupee />}
          value={k ? formatMoneyCompact(k.gmv) : '—'}
          delta={k && p ? { pct: pctChange(k.gmv, p.gmv), label: vs } : undefined}
          trend={daily?.slice(-14).map((d) => d.gmv)}
        />
        <StatTile
          label="Orders"
          icon={<ShoppingBag />}
          value={k ? formatNumber(k.orders) : '—'}
          delta={k && p ? { pct: pctChange(k.orders, p.orders), label: vs } : undefined}
        />
        <StatTile
          label="Average order"
          value={k ? formatMoney(k.averageOrderValue, { whole: true }) : '—'}
          delta={
            k && p
              ? { pct: pctChange(k.averageOrderValue, p.averageOrderValue), label: vs }
              : undefined
          }
        />
        <StatTile
          label="On-time delivery"
          icon={<Timer />}
          value={k ? formatPercent(k.onTimeRate) : '—'}
          delta={k && p ? { pct: pctChange(k.onTimeRate, p.onTimeRate), label: vs } : undefined}
        />
      </StatGrid>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <TrendChart
          className="lg:col-span-2"
          title="Sales per day"
          description="Order value incl. GST and delivery; cancelled and rejected orders excluded"
          data={daily}
          xKey="date"
          xFormat={(v) => formatShortDate(String(v))}
          series={[{ key: 'gmv', label: 'Sales' }]}
          kind="area"
          valueFormat={formatMoneyCompact}
          loading={cur.isFetching}
        />
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Row
              href={links.orders}
              icon={<ClipboardList />}
              label="Orders to confirm"
              value={k?.pendingConfirmation ?? 0}
              status={k?.pendingConfirmation ? 'PENDING' : 'COMPLETED'}
            />
            <Row
              href={links.products}
              icon={<AlertTriangle />}
              label="Products low or out of stock"
              value={k?.lowStockProducts ?? 0}
              status={k?.lowStockProducts ? 'LOW_STOCK' : 'IN_STOCK'}
            />
            <Row
              href={links.orders}
              icon={<PackageCheck />}
              label="Fulfilment rate"
              value={k ? formatPercent(k.fulfilmentRate) : '—'}
            />
            <Row
              href={links.orders}
              icon={<ShoppingBag />}
              label="Rejection rate"
              value={k ? formatPercent(k.rejectionRate) : '—'}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CategoryBarChart
          title="Top products by revenue"
          data={k?.topProducts.map((t) => ({ name: t.name, revenue: Math.round(t.revenue) }))}
          categoryKey="name"
          categoryLabel="Product"
          series={[{ key: 'revenue', label: 'Revenue' }]}
          valueFormat={formatMoneyCompact}
          layout="bars"
          loading={cur.isFetching}
        />
        <Card>
          <CardHeader>
            <CardTitle>Top buyers</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">Buyer</th>
                  <th className="py-2 pr-3 text-right font-medium">Orders</th>
                  <th className="py-2 text-right font-medium">Sales</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {(k?.topBuyers ?? []).map((b) => (
                  <tr key={b.buyerTenantId} className="border-b last:border-0">
                    <td className="py-2 pr-3">{b.name}</td>
                    <td className="py-2 pr-3 text-right">{b.orders}</td>
                    <td className="py-2 text-right">{formatMoney(b.gmv, { whole: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {k && !k.topBuyers.length ? (
              <p className="py-4 text-sm text-muted-foreground">No orders in this period.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({
  href,
  icon,
  label,
  value,
  status,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number | string;
  status?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
    >
      <span className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-2">
        <span className="font-semibold tabular">{value}</span>
        {status ? (
          <StatusBadge
            status={status}
            label={status === 'COMPLETED' || status === 'IN_STOCK' ? 'Clear' : undefined}
          />
        ) : null}
      </span>
    </Link>
  );
}
