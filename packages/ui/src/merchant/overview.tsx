'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ClipboardList,
  IndianRupee,
  Package,
  ShoppingBag,
  Timer,
  XCircle,
} from 'lucide-react';
import { TrendChart } from '../charts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import { chartDays, rangeFor } from '../components/date-range';
import { PageHeader, StatGrid } from '../components/layout';
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
import { useCan, useCanSeeSales } from './access';
import { OutletPicker, useOutlet } from './outlet';
import type { InventorySummary, ProfitReport, SalesReport } from './types';

interface ProcurementDashboard {
  openAlerts: Partial<Record<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', number>>;
  pendingApproval: number;
  awaitingSupplier: number;
  inTransit: number;
  deliveredNotReceived: number;
  monthToDateSpend: number;
}

const range = rangeFor('30d');

/** Home of the restaurant / food-cart dashboards: today's work and the last 30 days. */
export function MerchantOverview({
  title = 'Overview',
  links,
}: {
  title?: string;
  links: { orders: string; inventory: string; procurement: string; purchaseOrders: string };
}) {
  const { outletId, outlet } = useOutlet();
  // revenue needs reports:read; kitchen and counter staff get the operational half only
  const canSeeSales = useCanSeeSales();
  const reports = !!outletId && canSeeSales;
  const q = { outletId: outletId ?? undefined };
  const sales = useApi<SalesReport>(reports ? 'analytics/outlet/sales' : null, {
    ...q,
    from: range.from,
    to: range.to,
  });
  const prev = useApi<SalesReport>(reports ? 'analytics/outlet/sales' : null, {
    ...q,
    from: range.prevFrom,
    to: range.prevTo,
  });
  const profit = useApi<ProfitReport>(reports ? 'analytics/outlet/profitability' : null, {
    ...q,
    from: range.from,
    to: range.to,
  });
  const live = useApi<{ statusCounts: Record<string, number> }>(
    outletId ? 'merchant/orders' : null,
    { ...q, pageSize: 1 },
    { refetchInterval: 15_000 },
  );
  const inventory = useApi<InventorySummary>('inventory/summary', q);
  const canSeeProcurement = useCan('procurement:read');
  const procurement = useApi<ProcurementDashboard>(
    canSeeProcurement ? 'procurement/dashboard' : null,
  );

  const daily = chartDays(sales.data?.daily, range, {
    orders: 0,
    gmv: 0,
    netSales: 0,
    cancelled: 0,
  });
  const k = sales.data?.kpis;
  const p = prev.data?.kpis;
  const counts = live.data?.statusCounts ?? {};
  const alerts = procurement.data?.openAlerts ?? {};
  const urgentAlerts = (alerts.CRITICAL ?? 0) + (alerts.HIGH ?? 0);

  return (
    <>
      <PageHeader
        title={title}
        description={outlet ? `${outlet.name} · last 30 days vs the 30 before` : 'Last 30 days'}
        actions={<OutletPicker />}
      />
      {canSeeSales && (
        <StatGrid>
          <StatTile
            label="Net sales"
            value={k ? formatMoneyCompact(k.netSales) : '—'}
            icon={<IndianRupee />}
            delta={
              k && p
                ? { pct: pctChange(k.netSales, p.netSales), label: 'vs prior 30 days' }
                : undefined
            }
            trend={daily?.slice(-14).map((d) => d.netSales)}
          />
          <StatTile
            label="Orders"
            value={k ? formatNumber(k.orders) : '—'}
            icon={<ShoppingBag />}
            delta={
              k && p ? { pct: pctChange(k.orders, p.orders), label: 'vs prior 30 days' } : undefined
            }
          />
          <StatTile
            label="Average order value"
            value={k ? formatMoney(k.averageOrderValue, { whole: true }) : '—'}
            icon={<Timer />}
            delta={
              k && p
                ? {
                    pct: pctChange(k.averageOrderValue, p.averageOrderValue),
                    label: 'vs prior 30 days',
                  }
                : undefined
            }
          />
          <StatTile
            label="Cancellation rate"
            value={k ? formatPercent(k.cancellationRatePct) : '—'}
            icon={<XCircle />}
            delta={
              k && p
                ? {
                    pct: pctChange(k.cancellationRatePct, p.cancellationRatePct),
                    label: 'vs prior 30 days',
                    upIsGood: false,
                  }
                : undefined
            }
          />
        </StatGrid>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {canSeeSales && (
          <TrendChart
            className="lg:col-span-2"
            title="Net sales per day"
            description="After discounts, before commission"
            data={daily}
            xKey="date"
            xFormat={(v) => formatShortDate(String(v))}
            series={[{ key: 'netSales', label: 'Net sales' }]}
            kind="area"
            valueFormat={(v) => formatMoneyCompact(v)}
            loading={sales.isFetching}
          />
        )}
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <AttentionRow
              href={links.orders}
              icon={<ClipboardList />}
              label="New orders waiting"
              value={counts.PLACED ?? 0}
              status={counts.PLACED ? 'PENDING' : 'COMPLETED'}
            />
            <AttentionRow
              href={links.orders}
              icon={<ShoppingBag />}
              label="In the kitchen"
              value={(counts.ACCEPTED ?? 0) + (counts.PREPARING ?? 0)}
            />
            {canSeeProcurement && (
              <>
                <AttentionRow
                  href={links.procurement}
                  icon={<AlertTriangle />}
                  label="Critical & high reorder alerts"
                  value={urgentAlerts}
                  status={urgentAlerts ? 'HIGH' : 'COMPLETED'}
                />
                <AttentionRow
                  href={links.purchaseOrders}
                  icon={<ClipboardList />}
                  label="Purchase orders to approve"
                  value={procurement.data?.pendingApproval ?? 0}
                  status={procurement.data?.pendingApproval ? 'PENDING_APPROVAL' : 'COMPLETED'}
                />
                <AttentionRow
                  href={links.purchaseOrders}
                  icon={<Package />}
                  label="Deliveries to receive"
                  value={procurement.data?.deliveredNotReceived ?? 0}
                  status={procurement.data?.deliveredNotReceived ? 'DELIVERED' : 'COMPLETED'}
                />
              </>
            )}
            <AttentionRow
              href={links.inventory}
              icon={<Package />}
              label="Ingredients low / out"
              value={`${inventory.data?.lowStock ?? 0} / ${inventory.data?.outOfStock ?? 0}`}
              status={
                inventory.data?.outOfStock
                  ? 'OUT_OF_STOCK'
                  : inventory.data?.lowStock
                    ? 'LOW_STOCK'
                    : 'IN_STOCK'
              }
            />
          </CardContent>
        </Card>
      </div>

      {canSeeSales && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Food cost"
            value={profit.data ? formatPercent(profit.data.foodCostPct) : '—'}
            delta={undefined}
          />
          <StatTile
            label="Platform commission"
            value={profit.data ? formatPercent(profit.data.commissionPct) : '—'}
          />
          <StatTile
            label="Gross margin"
            value={profit.data ? formatPercent(profit.data.marginPct) : '—'}
          />
        </div>
      )}
    </>
  );
}

function AttentionRow({
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
