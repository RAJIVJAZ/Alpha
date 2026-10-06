'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { CategoryBarChart } from '../charts';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { DataTable, type Column } from '../components/data-table';
import { DateRangePicker, useDateRange } from '../components/date-range';
import { Input, Select } from '../components/form';
import { FilterBar, PageHeader, StatGrid } from '../components/layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/menu';
import { StatTile } from '../components/stat-tile';
import { type Paged } from '../lib/api';
import { formatDateTime, formatMoney, formatMoneyCompact, humanize, istDate } from '../lib/format';
import { useApi } from '../lib/hooks';

interface Summary {
  totals: { taxableValue: number; cgst: number; sgst: number; igst: number; totalTax: number };
  byType: {
    type: string;
    interState: boolean;
    invoices: number;
    taxableValue: string;
    cgst: string;
    sgst: string;
    igst: string;
    total: string;
  }[];
}
interface Gstr8 {
  month: string;
  operatorGstin: string;
  suppliers: {
    supplierGstin: string | null;
    supplierName: string;
    invoices: number;
    netTaxableValue: number;
    tcsIgst: number;
    tcsCgst: number;
    tcsSgst: number;
  }[];
  totalTcs: number;
}
interface Invoice {
  id: string;
  invoiceNumber: string;
  type: string;
  supplierName: string;
  supplierGstin: string | null;
  recipientName: string | null;
  recipientGstin: string | null;
  placeOfSupply: string | null;
  isInterState: boolean;
  hsnSac: string | null;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
  issuedAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  CUSTOMER_ORDER: 'Food orders (s. 9(5), paid by platform)',
  COMMISSION: 'Commission invoices to merchants',
  DELIVERY_SERVICE: 'Delivery & platform fees',
  B2B_SALE: 'Marketplace goods (supplier invoices)',
};

function downloadCsv(name: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) =>
    v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const url = URL.createObjectURL(
    new Blob([[header, ...rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }),
  );
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

/** GST reports: output tax by supply type, GSTR-8 (TCS) and the invoice register. */
export function GstReports() {
  return (
    <>
      <PageHeader
        title="GST"
        description="Output tax by supply, TCS returns and the invoice register"
      />
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="gstr8">GSTR-8 (TCS)</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <SummaryTab />
        </TabsContent>
        <TabsContent value="gstr8">
          <Gstr8Tab />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

function SummaryTab() {
  const { range, preset, setPreset } = useDateRange('mtd');
  const s = useApi<Summary>('admin/gst/summary', { from: range.from, to: range.to });
  const t = s.data?.totals;
  const rows = (s.data?.byType ?? []).map((r) => ({
    ...r,
    label: `${TYPE_LABEL[r.type] ?? humanize(r.type)}${r.interState ? ' · inter-state' : ''}`,
  }));
  return (
    <div className="grid gap-4">
      <FilterBar>
        <DateRangePicker
          value={preset}
          onChange={setPreset}
          options={['mtd', '7d', '30d', '90d']}
        />
      </FilterBar>
      <StatGrid>
        <StatTile label="Taxable value" value={t ? formatMoneyCompact(t.taxableValue) : '—'} />
        <StatTile label="CGST" value={t ? formatMoneyCompact(t.cgst) : '—'} />
        <StatTile label="SGST" value={t ? formatMoneyCompact(t.sgst) : '—'} />
        <StatTile label="IGST" value={t ? formatMoneyCompact(t.igst) : '—'} />
      </StatGrid>
      <div className="grid gap-4 xl:grid-cols-2">
        <CategoryBarChart
          title="Tax by supply type"
          data={rows.map((r) => ({
            label: r.label,
            tax: Math.round(Number(r.cgst) + Number(r.sgst) + Number(r.igst)),
          }))}
          categoryKey="label"
          categoryLabel="Supply"
          series={[{ key: 'tax', label: 'GST' }]}
          valueFormat={formatMoneyCompact}
          layout="bars"
          loading={s.isFetching}
        />
        <Card>
          <CardHeader>
            <CardTitle>By supply type</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">Supply</th>
                  <th className="py-2 pr-3 text-right font-medium">Invoices</th>
                  <th className="py-2 pr-3 text-right font-medium">Taxable</th>
                  <th className="py-2 text-right font-medium">GST</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.type}-${r.interState}`} className="border-b last:border-0">
                    <td className="py-2 pr-3">{r.label}</td>
                    <td className="py-2 pr-3 text-right">{r.invoices.toLocaleString('en-IN')}</td>
                    <td className="py-2 pr-3 text-right">
                      {formatMoney(r.taxableValue, { whole: true })}
                    </td>
                    <td className="py-2 text-right">
                      {formatMoney(Number(r.cgst) + Number(r.sgst) + Number(r.igst), {
                        whole: true,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Gstr8Tab() {
  const [month, setMonth] = React.useState(() => {
    const [y, m] = istDate(0).split('-').map(Number) as [number, number];
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  });
  const r = useApi<Gstr8>('admin/gst/gstr8', { month });
  const d = r.data;
  const columns: Column<Gstr8['suppliers'][number]>[] = [
    {
      key: 'name',
      header: 'Supplier',
      cell: (s) => (
        <div>
          <p className="font-medium">{s.supplierName}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {s.supplierGstin ?? 'Unregistered'}
          </p>
        </div>
      ),
    },
    { key: 'inv', header: 'Invoices', align: 'right', cell: (s) => s.invoices },
    {
      key: 'net',
      header: 'Net taxable value',
      align: 'right',
      sortValue: (s) => s.netTaxableValue,
      cell: (s) => formatMoney(s.netTaxableValue),
    },
    { key: 'igst', header: 'TCS IGST', align: 'right', cell: (s) => formatMoney(s.tcsIgst) },
    { key: 'cgst', header: 'TCS CGST', align: 'right', cell: (s) => formatMoney(s.tcsCgst) },
    { key: 'sgst', header: 'TCS SGST', align: 'right', cell: (s) => formatMoney(s.tcsSgst) },
  ];
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
        <div>
          <CardTitle>GSTR-8 · TCS collected by the e-commerce operator</CardTitle>
          <CardDescription>
            1% on net taxable value of goods sold through the marketplace; due by the 10th of the
            next month
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            aria-label="Return period"
            className="w-40"
            value={month}
            max={istDate(0).slice(0, 7)}
            onChange={(e) => setMonth(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!d?.suppliers.length}
            onClick={() =>
              d &&
              downloadCsv(
                `gstr8-${d.month}.csv`,
                [
                  'GSTIN of supplier',
                  'Supplier name',
                  'Invoices',
                  'Net taxable value',
                  'IGST',
                  'CGST',
                  'SGST',
                ],
                d.suppliers.map((s) => [
                  s.supplierGstin,
                  s.supplierName,
                  s.invoices,
                  s.netTaxableValue,
                  s.tcsIgst,
                  s.tcsCgst,
                  s.tcsSgst,
                ]),
              )
            }
          >
            <Download /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <DataTable
          columns={columns}
          rows={d?.suppliers}
          getRowId={(s) => `${s.supplierGstin}-${s.supplierName}`}
          loading={r.isLoading}
          fetching={r.isFetching}
          empty={{ title: 'No marketplace sales in this month' }}
        />
        {d ? (
          <p className="text-right text-sm font-semibold">Total TCS {formatMoney(d.totalTcs)}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InvoicesTab() {
  const { range, preset, setPreset } = useDateRange('7d');
  const [type, setType] = React.useState('');
  const [page, setPage] = React.useState(1);
  const list = useApi<Paged<Invoice>>('admin/gst/invoices', {
    from: range.from,
    to: range.to,
    type: type || undefined,
    page,
    pageSize: 25,
  });
  const columns: Column<Invoice>[] = [
    {
      key: 'no',
      header: 'Invoice',
      cell: (i) => (
        <div>
          <p className="font-mono text-xs font-medium">{i.invoiceNumber}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(i.issuedAt)}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (i) => humanize(i.type) },
    {
      key: 'from',
      header: 'Supplier',
      cell: (i) => (
        <div>
          <p>{i.supplierName}</p>
          <p className="font-mono text-xs text-muted-foreground">{i.supplierGstin ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'to',
      header: 'Recipient',
      cell: (i) => (
        <div>
          <p>{i.recipientName ?? 'Consumer'}</p>
          <p className="font-mono text-xs text-muted-foreground">{i.recipientGstin ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'hsn',
      header: 'HSN/SAC',
      cell: (i) => <span className="font-mono text-xs">{i.hsnSac ?? '—'}</span>,
    },
    { key: 'taxable', header: 'Taxable', align: 'right', cell: (i) => formatMoney(i.taxableValue) },
    {
      key: 'tax',
      header: 'Tax',
      align: 'right',
      cell: (i) =>
        i.isInterState
          ? `IGST ${formatMoney(i.igst)}`
          : formatMoney(Number(i.cgst) + Number(i.sgst)),
    },
    { key: 'total', header: 'Total', align: 'right', cell: (i) => formatMoney(i.total) },
  ];
  return (
    <>
      <FilterBar>
        <DateRangePicker
          value={preset}
          onChange={(p) => (setPreset(p), setPage(1))}
          options={['today', '7d', '30d', 'mtd']}
        />
        <Select
          aria-label="Invoice type"
          className="w-56"
          value={type}
          onChange={(e) => (setType(e.target.value), setPage(1))}
        >
          <option value="">All types</option>
          {Object.keys(TYPE_LABEL).map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(i) => i.id}
        loading={list.isLoading}
        fetching={list.isFetching}
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
    </>
  );
}
