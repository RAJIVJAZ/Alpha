'use client';

import * as React from 'react';
import { Download, Landmark } from 'lucide-react';
import { CategoryBarChart } from '../charts';
import { Button } from '../components/button';
import { DataTable, type Column } from '../components/data-table';
import { Dialog, DialogTitle, SheetContent } from '../components/dialog';
import { PageHeader, StatGrid } from '../components/layout';
import { StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import { type Paged } from '../lib/api';
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatShortDate,
} from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Settlement } from './types';

interface SettlementLine {
  id: string;
  orderId: string;
  orderDate: string;
  orderTotal: string;
  taxableValue: string;
  gstCollected: string;
  merchantDiscount: string;
  commission: string;
  commissionGst: string;
  tcs: string;
  tds: string;
  netAmount: string;
}
type SettlementDetail = Settlement & {
  refunds: string;
  adjustments: string;
  notes: string | null;
  lines: SettlementLine[];
};

/** Period end is exclusive (next Monday 00:00 IST); show the last day of the week. */
const periodLabel = (s: Pick<Settlement, 'periodStart' | 'periodEnd'>) =>
  `${formatShortDate(s.periodStart)} – ${formatShortDate(new Date(new Date(s.periodEnd).getTime() - 1))}`;

/**
 * Weekly payouts for any seller on the platform (restaurants, carts,
 * suppliers): accrued amounts, deductions and per-order lines.
 */
export function SettlementsView({
  description = 'Weekly payouts after commission, GST on fees, TCS and TDS',
}: {
  description?: string;
}) {
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const list = useApi<Paged<Settlement>>('settlements', { page, pageSize: 12 });
  const pending = useApi<{
    orders: number;
    grossSales: string;
    commission: string;
    estimatedPayout: string;
  }>('settlements/pending');
  const rows = list.data?.data ?? [];
  const lastPaid = rows.find((s) => s.status === 'PAID');

  const columns: Column<Settlement>[] = [
    {
      key: 'period',
      header: 'Week',
      cell: (s) => <span className="font-medium">{periodLabel(s)}</span>,
    },
    { key: 'orders', header: 'Orders', align: 'right', cell: (s) => formatNumber(s.ordersCount) },
    {
      key: 'gross',
      header: 'Sales (ex-GST)',
      align: 'right',
      cell: (s) => formatMoney(s.grossSales, { whole: true }),
    },
    {
      key: 'comm',
      header: 'Commission + GST',
      align: 'right',
      cell: (s) => formatMoney(Number(s.commission) + Number(s.commissionGst), { whole: true }),
    },
    {
      key: 'tax',
      header: 'TCS + TDS',
      align: 'right',
      cell: (s) => formatMoney(Number(s.tcs) + Number(s.tds)),
    },
    {
      key: 'net',
      header: 'Net payout',
      align: 'right',
      sortValue: (s) => Number(s.netPayable),
      cell: (s) => <span className="font-semibold">{formatMoney(s.netPayable)}</span>,
    },
    { key: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
    {
      key: 'utr',
      header: 'UTR',
      cell: (s) => <span className="font-mono text-xs">{s.payoutReference ?? '—'}</span>,
    },
  ];
  const chart = [...rows].reverse().map((s) => ({
    week: formatShortDate(s.periodStart),
    payout: Math.round(Number(s.netPayable)),
    deductions: Math.round(
      Number(s.commission) + Number(s.commissionGst) + Number(s.tcs) + Number(s.tds),
    ),
  }));

  return (
    <>
      <PageHeader title="Payouts" description={description} />
      <StatGrid>
        <StatTile
          label="Accrued, not yet settled"
          value={pending.data ? formatMoneyCompact(pending.data.estimatedPayout) : '—'}
          icon={<Landmark />}
        />
        <StatTile
          label="Orders since last settlement"
          value={pending.data ? formatNumber(pending.data.orders) : '—'}
        />
        <StatTile
          label="Last payout"
          value={lastPaid ? formatMoneyCompact(lastPaid.netPayable) : '—'}
        />
        <StatTile
          label="Last paid on"
          value={lastPaid?.paidAt ? formatDate(lastPaid.paidAt) : '—'}
        />
      </StatGrid>
      {chart.length > 1 ? (
        <CategoryBarChart
          className="mt-6"
          title="Payout vs platform deductions by week"
          data={chart}
          categoryKey="week"
          categoryLabel="Week starting"
          series={[
            { key: 'payout', label: 'Net payout', slot: 1 },
            { key: 'deductions', label: 'Commission, GST on fees, TCS, TDS', slot: 2 },
          ]}
          valueFormat={formatMoneyCompact}
        />
      ) : null}
      <DataTable
        className="mt-6"
        columns={columns}
        rows={list.data?.data}
        getRowId={(s) => s.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        onRowClick={(s) => setOpenId(s.id)}
        empty={{
          title: 'No settlements yet',
          description: 'Payouts are calculated every Monday for the previous week.',
        }}
        pagination={
          list.data
            ? {
                page,
                totalPages: list.data.meta.totalPages,
                total: list.data.meta.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />
      <Dialog open={!!openId} onOpenChange={(o) => (!o ? setOpenId(null) : undefined)}>
        <SheetContent side="right" className="w-full max-w-2xl" aria-describedby={undefined}>
          {openId ? <SettlementDetailPanel id={openId} /> : null}
        </SheetContent>
      </Dialog>
    </>
  );
}

function SettlementDetailPanel({ id }: { id: string }) {
  const s = useApi<SettlementDetail>(`settlements/${id}`).data;
  const [page, setPage] = React.useState(1);
  if (!s) return <DialogTitle className="sr-only">Loading settlement</DialogTitle>;
  const per = 25;
  const lines = s.lines.slice((page - 1) * per, page * per);
  const deductions =
    Number(s.commission) +
    Number(s.commissionGst) +
    Number(s.tcs) +
    Number(s.tds) +
    Number(s.refunds) -
    Number(s.adjustments);
  // goods sellers also receive the GST they charged (they remit it themselves); restaurants don't (section 9(5))
  const gstPassThrough =
    Math.round((Number(s.netPayable) - (Number(s.grossSales) - deductions)) * 100) / 100;
  const breakdown: [string, number, boolean?][] = [
    ['Sales (ex-GST, after your discounts)', Number(s.grossSales)],
    ['GST you charged (you remit it)', gstPassThrough],
    ['Commission', -Number(s.commission)],
    ['GST on commission (18%)', -Number(s.commissionGst)],
    ['TCS (1%)', -Number(s.tcs)],
    ['TDS (194-O)', -Number(s.tds)],
    ['Refunds', -Number(s.refunds)],
    ['Adjustments', Number(s.adjustments)],
    ['Net payout', Number(s.netPayable), true],
  ];
  const columns: Column<SettlementLine>[] = [
    { key: 'date', header: 'Order date', cell: (l) => formatShortDate(l.orderDate) },
    { key: 'total', header: 'Order total', align: 'right', cell: (l) => formatMoney(l.orderTotal) },
    { key: 'gst', header: 'GST', align: 'right', cell: (l) => formatMoney(l.gstCollected) },
    {
      key: 'comm',
      header: 'Commission',
      align: 'right',
      cell: (l) => formatMoney(Number(l.commission) + Number(l.commissionGst)),
    },
    { key: 'net', header: 'Net', align: 'right', cell: (l) => formatMoney(l.netAmount) },
  ];
  const csv = () => {
    const head =
      'orderId,orderDate,orderTotal,taxableValue,gstCollected,merchantDiscount,commission,commissionGst,tcs,tds,netAmount';
    const body = s.lines.map((l) =>
      [
        l.orderId,
        l.orderDate.slice(0, 10),
        l.orderTotal,
        l.taxableValue,
        l.gstCollected,
        l.merchantDiscount,
        l.commission,
        l.commissionGst,
        l.tcs,
        l.tds,
        l.netAmount,
      ].join(','),
    );
    const url = URL.createObjectURL(new Blob([[head, ...body].join('\n')], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `settlement-${s.periodStart.slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-5">
      <div className="pr-8">
        <DialogTitle>Week of {periodLabel(s)}</DialogTitle>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={s.status} /> {s.ordersCount} orders
          {s.payoutReference ? ` · UTR ${s.payoutReference}` : ''}
          {s.paidAt ? ` · paid ${formatDate(s.paidAt)}` : ''}
        </p>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm tabular">
        {breakdown.map(([label, value, total]) =>
          Math.abs(value) >= 0.01 || total ? (
            <React.Fragment key={label}>
              <dt className={total ? 'border-t pt-1.5 font-semibold' : 'text-muted-foreground'}>
                {label}
              </dt>
              <dd className={total ? 'border-t pt-1.5 text-right font-semibold' : 'text-right'}>
                {formatMoney(value)}
              </dd>
            </React.Fragment>
          ) : null,
        )}
      </dl>
      {Number(s.merchantDiscounts) ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          Includes {formatMoney(s.merchantDiscounts)} of discounts you funded.
        </p>
      ) : null}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Orders in this payout</h3>
        <Button size="sm" variant="outline" onClick={csv}>
          <Download /> CSV
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={lines}
        getRowId={(l) => l.id}
        pagination={{
          page,
          totalPages: Math.max(1, Math.ceil(s.lines.length / per)),
          total: s.lines.length,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
