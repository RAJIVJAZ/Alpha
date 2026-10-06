'use client';

import { CategoryBarChart, TrendChart, WeekHourHeatmap } from '../charts';
import { chartDays, DateRangePicker, useDateRange } from '../components/date-range';
import { FilterBar, PageHeader, StatGrid } from '../components/layout';
import { pctChange, StatTile } from '../components/stat-tile';
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatShortDate,
  humanize,
} from '../lib/format';
import { useApi } from '../lib/hooks';
import { OutletPicker, useOutlet } from './outlet';
import type { ProfitReport, SalesReport } from './types';

/** Daily sales & profitability report (restaurant "daily sales reports", food cart "daily sales tracking"). */
export function SalesReportView() {
  const { outletId } = useOutlet();
  const { range, preset, setPreset } = useDateRange('30d');
  const q = { outletId: outletId ?? undefined };
  const cur = useApi<SalesReport>(outletId ? 'analytics/outlet/sales' : null, {
    ...q,
    from: range.from,
    to: range.to,
  });
  const prev = useApi<SalesReport>(outletId ? 'analytics/outlet/sales' : null, {
    ...q,
    from: range.prevFrom,
    to: range.prevTo,
  });
  const profit = useApi<ProfitReport>(outletId ? 'analytics/outlet/profitability' : null, {
    ...q,
    from: range.from,
    to: range.to,
  });
  const k = cur.data?.kpis;
  const p = prev.data?.kpis;
  const vs = 'vs previous period';
  const daily = chartDays(cur.data?.daily, range, { orders: 0, gmv: 0, netSales: 0, cancelled: 0 });
  const profitDaily = chartDays(profit.data?.daily, range, {
    orders: 0,
    netSales: 0,
    commission: 0,
    foodCost: 0,
    grossProfit: 0,
  });

  return (
    <>
      <PageHeader
        title="Sales reports"
        description="Orders, revenue, channels and peak hours. Daily charts show complete days; totals include today."
      />
      <FilterBar>
        <DateRangePicker value={preset} onChange={setPreset} />
        <OutletPicker />
      </FilterBar>
      <StatGrid>
        <StatTile
          label="Gross sales (GMV)"
          value={k ? formatMoneyCompact(k.gmv) : '—'}
          delta={k && p ? { pct: pctChange(k.gmv, p.gmv), label: vs } : undefined}
        />
        <StatTile
          label="Net sales"
          value={k ? formatMoneyCompact(k.netSales) : '—'}
          delta={k && p ? { pct: pctChange(k.netSales, p.netSales), label: vs } : undefined}
        />
        <StatTile
          label="Orders"
          value={k ? formatNumber(k.orders) : '—'}
          delta={k && p ? { pct: pctChange(k.orders, p.orders), label: vs } : undefined}
        />
        <StatTile
          label="Repeat customers"
          value={k ? formatNumber(k.repeatCustomers) : '—'}
          delta={
            k && p ? { pct: pctChange(k.repeatCustomers, p.repeatCustomers), label: vs } : undefined
          }
        />
      </StatGrid>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <TrendChart
          title="Net sales"
          data={daily}
          xKey="date"
          xFormat={(v) => formatShortDate(String(v))}
          series={[{ key: 'netSales', label: 'Net sales' }]}
          kind="area"
          valueFormat={formatMoneyCompact}
          loading={cur.isFetching}
        />
        <TrendChart
          title="Orders"
          description="Completed vs cancelled"
          integer
          data={daily}
          xKey="date"
          xFormat={(v) => formatShortDate(String(v))}
          series={[
            { key: 'orders', label: 'Completed', slot: 1 },
            { key: 'cancelled', label: 'Cancelled', slot: 2 },
          ]}
          valueFormat={(v) => formatNumber(v)}
          loading={cur.isFetching}
        />
        <CategoryBarChart
          title="Sales by channel"
          data={cur.data?.byChannel.map((c) => ({ channel: humanize(c.channel), gmv: c.gmv }))}
          categoryKey="channel"
          categoryLabel="Channel"
          series={[{ key: 'gmv', label: 'GMV' }]}
          valueFormat={formatMoneyCompact}
          layout="bars"
        />
        <CategoryBarChart
          title="Payment methods"
          description="Orders by how the customer paid"
          data={cur.data?.byPaymentMethod.map((c) => ({
            method: humanize(c.method),
            orders: c.orders,
          }))}
          categoryKey="method"
          categoryLabel="Method"
          series={[{ key: 'orders', label: 'Orders' }]}
          valueFormat={(v) => formatNumber(v)}
          layout="bars"
        />
      </div>

      <div className="mt-4">
        <WeekHourHeatmap
          title="Peak hours"
          description="Orders by weekday and hour (IST)"
          cells={cur.data?.heatmap}
        />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Profitability</h2>
      <StatGrid>
        <StatTile
          label="Gross profit"
          value={profit.data ? formatMoneyCompact(profit.data.totals.grossProfit) : '—'}
        />
        <StatTile
          label="Gross margin"
          value={profit.data ? formatPercent(profit.data.marginPct) : '—'}
        />
        <StatTile
          label="Food cost"
          value={profit.data ? formatMoney(profit.data.totals.foodCost, { whole: true }) : '—'}
        />
        <StatTile
          label="Commission paid"
          value={profit.data ? formatMoney(profit.data.totals.commission, { whole: true }) : '—'}
        />
      </StatGrid>
      <div className="mt-4">
        <TrendChart
          title="Where each day's sales went"
          description="Net sales split into food cost, commission and gross profit"
          data={profitDaily}
          xKey="date"
          xFormat={(v) => formatShortDate(String(v))}
          series={[
            { key: 'grossProfit', label: 'Gross profit', slot: 1 },
            { key: 'foodCost', label: 'Food cost', slot: 2 },
            { key: 'commission', label: 'Commission', slot: 3 },
          ]}
          valueFormat={formatMoneyCompact}
          loading={profit.isFetching}
        />
      </div>
    </>
  );
}
