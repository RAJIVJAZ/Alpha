'use client';

import * as React from 'react';
import Link from 'next/link';
import { BrainCircuit, Radar, Scale, ShoppingCart, Truck, X } from 'lucide-react';
import { TrendChart } from '../charts';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/card';
import { DataTable, type Column } from '../components/data-table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/dialog';
import { Field, Input, Select } from '../components/form';
import { FilterBar, PageHeader, StatGrid } from '../components/layout';
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/menu';
import { StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import { Badge } from '../components/badge';
import { api } from '../lib/api';
import { formatDateTime, formatMoney, formatMoneyCompact, formatNumber, formatPercent, formatShortDate, humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { OutletPicker, useOutlet } from './outlet';
import type { ReorderAlert, SupplierOption, SupplierRecommendation } from './types';

export const SUPPLIER_STRATEGIES = ['BALANCED', 'LOWEST_COST', 'FASTEST', 'BEST_RATED'] as const;
type Strategy = (typeof SUPPLIER_STRATEGIES)[number];
const STRATEGY_LABEL: Record<Strategy, string> = { BALANCED: 'Balanced', LOWEST_COST: 'Lowest cost', FASTEST: 'Fastest', BEST_RATED: 'Best rated' };

interface Dashboard {
  openAlerts: Partial<Record<ReorderAlert['severity'], number>>;
  pendingApproval: number;
  awaitingSupplier: number;
  inTransit: number;
  deliveredNotReceived: number;
  monthToDateSpend: number;
  autoPoShare: number;
}
interface Settings {
  autoPoEnabled: boolean;
  autoApproveBelow: string;
  defaultStrategy: Strategy;
  forecastHorizonDays: number;
  serviceLevel: number;
  reviewPeriodDays: number;
}
interface AutoPoResult {
  created: { id: string; poNumber: string; supplierName: string; total: string; status: string; items: number }[];
  skipped: { alertId: string; ingredient: string; reason: string }[];
}
interface ForecastSeries {
  ingredient?: { id: string; name: string; unit: string; currentStock: string };
  history: { date: string; value: number }[];
  forecast: { date: string; value: number; lower: number; upper: number; model: string; signals: string[] }[];
}

const qty = (v: string | number, unit: string) => `${formatNumber(Number(v), { decimals: true })} ${unit.toLowerCase()}`;

/**
 * Smart procurement: consumption → forecast → depletion → reorder alerts →
 * supplier comparison → auto-PO → owner approval. Purchase orders themselves
 * live on the purchase-orders screen.
 */
export function ProcurementCenter({ purchaseOrdersHref }: { purchaseOrdersHref: string }) {
  const { outletId } = useOutlet();
  const dash = useApi<Dashboard>('procurement/dashboard');
  const d = dash.data;
  const scan = useApiMutation(() => api.post<{ scanned: number; opened: number; resolved: number }>(`procurement/alerts/scan${outletId ? `?outletId=${outletId}` : ''}`), {
    invalidate: ['procurement/'],
    success: (r) => `Checked ${r.scanned} ingredients · ${r.opened} new alerts · ${r.resolved} resolved`,
  });
  const forecast = useApiMutation(() => api.post<{ forecasted: number; failed: number }>(`procurement/forecasts/run${outletId ? `?outletId=${outletId}` : ''}`), {
    invalidate: ['procurement/forecasts'],
    success: (r) => `Forecast ${r.forecasted} ingredients${r.failed ? ` (${r.failed} failed)` : ''}`,
  });
  const urgent = (d?.openAlerts.CRITICAL ?? 0) + (d?.openAlerts.HIGH ?? 0);
  const totalAlerts = Object.values(d?.openAlerts ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Procurement"
        description="Forecast demand, predict stock-outs and buy from the best supplier"
        actions={
          <>
            <OutletPicker />
            <Button variant="outline" size="sm" onClick={() => forecast.mutate()} loading={forecast.isPending}>
              <BrainCircuit /> Run forecasts
            </Button>
            <Button size="sm" onClick={() => scan.mutate()} loading={scan.isPending}>
              <Radar /> Scan stock
            </Button>
          </>
        }
      />
      <StatGrid>
        <StatTile label="Open reorder alerts" value={d ? `${formatNumber(totalAlerts)}` : '—'} icon={<Radar />} />
        <StatTile label="Critical & high" value={d ? formatNumber(urgent) : '—'} />
        <StatTile label="POs awaiting approval" value={d ? formatNumber(d.pendingApproval) : '—'} />
        <StatTile label="Spend this month" value={d ? formatMoneyCompact(d.monthToDateSpend) : '—'} icon={<ShoppingCart />} />
      </StatGrid>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          <Truck className="mr-1 inline size-4" aria-hidden />
          {d?.awaitingSupplier ?? 0} awaiting supplier · {d?.inTransit ?? 0} in transit · {d?.deliveredNotReceived ?? 0} delivered, not yet received
        </span>
        <span>{d ? `${formatPercent(d.autoPoShare, 0)} of POs this month raised automatically` : null}</span>
        <Link href={purchaseOrdersHref} className="text-primary hover:underline">
          View purchase orders →
        </Link>
      </div>

      <Tabs defaultValue="alerts" className="mt-6">
        <TabsList>
          <TabsTrigger value="alerts">Reorder alerts</TabsTrigger>
          <TabsTrigger value="forecast">Demand forecast</TabsTrigger>
          <TabsTrigger value="settings">Automation</TabsTrigger>
        </TabsList>
        <TabsContent value="alerts">
          <Alerts outletId={outletId} purchaseOrdersHref={purchaseOrdersHref} />
        </TabsContent>
        <TabsContent value="forecast">
          <Forecast outletId={outletId} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsForm />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Alerts({ outletId, purchaseOrdersHref }: { outletId: string | null; purchaseOrdersHref: string }) {
  const [severity, setSeverity] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [strategy, setStrategy] = React.useState<Strategy>('BALANCED');
  const [compare, setCompare] = React.useState<ReorderAlert | null>(null);
  const [result, setResult] = React.useState<AutoPoResult | null>(null);
  const alerts = useApi<ReorderAlert[]>('procurement/alerts', { outletId: outletId ?? undefined, severity: severity || undefined });
  const rows = alerts.data ?? [];
  React.useEffect(() => setSelected(new Set()), [outletId, severity]);

  const dismiss = useApiMutation((id: string) => api.post(`procurement/alerts/${id}/dismiss`), { invalidate: ['procurement/'], success: 'Alert dismissed' });
  const auto = useApiMutation(() => api.post<AutoPoResult>('procurement/purchase-orders/auto', { alertIds: selected.size ? [...selected] : rows.map((a) => a.id), strategy }), {
    invalidate: ['procurement/'],
    onSuccess: (r) => (setResult(r), setSelected(new Set())),
  });
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  const allChecked = rows.length > 0 && rows.every((a) => selected.has(a.id));

  const columns: Column<ReorderAlert>[] = [
    {
      key: 'sel',
      header: <input type="checkbox" aria-label="Select all alerts" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((a) => a.id)))} className="size-4 accent-[var(--primary)]" />,
      cell: (a) => <input type="checkbox" aria-label={`Select ${a.ingredientName}`} checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="size-4 accent-[var(--primary)]" />,
    },
    { key: 'ing', header: 'Ingredient', sortValue: (a) => a.ingredientName, cell: (a) => (<div><p className="font-medium">{a.ingredientName}</p><p className="text-xs text-muted-foreground">{humanize(a.category)}</p></div>) },
    { key: 'stock', header: 'In stock', align: 'right', cell: (a) => qty(a.currentStock, a.unit) },
    { key: 'use', header: 'Daily use', align: 'right', cell: (a) => qty(a.avgDailyUsage, a.unit) },
    { key: 'cover', header: 'Days of cover', align: 'right', sortValue: (a) => a.daysOfCover, cell: (a) => formatNumber(a.daysOfCover, { decimals: true }) },
    { key: 'runout', header: 'Runs out', sortValue: (a) => a.predictedDepletionDate, cell: (a) => (a.predictedDepletionDate ? formatDateTime(a.predictedDepletionDate) : '—') },
    { key: 'suggest', header: 'Order', align: 'right', cell: (a) => qty(a.suggestedQty, a.unit) },
    { key: 'sev', header: 'Severity', sortValue: (a) => ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(a.severity), cell: (a) => <StatusBadge status={a.severity} label={humanize(a.severity)} /> },
    {
      key: 'act',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (a) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => setCompare(a)}>
            <Scale /> Compare
          </Button>
          <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(a.id)} aria-label={`Dismiss alert for ${a.ingredientName}`}>
            <X />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <FilterBar>
        <Select aria-label="Severity" className="w-40" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select aria-label="Supplier strategy" className="w-40" value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
            {SUPPLIER_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {STRATEGY_LABEL[s]}
              </option>
            ))}
          </Select>
          <Button onClick={() => auto.mutate()} loading={auto.isPending} disabled={!rows.length}>
            <ShoppingCart /> {selected.size ? `Create POs for ${selected.size}` : 'Create POs for all'}
          </Button>
        </div>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={alerts.data}
        getRowId={(a) => a.id}
        loading={alerts.isLoading}
        fetching={alerts.isFetching}
        empty={{ title: 'No open reorder alerts', description: 'Stock covers forecast demand. Scan again after large orders or deliveries.' }}
      />
      <CompareDialog alert={compare} outletId={outletId} onClose={() => setCompare(null)} />
      <Dialog open={!!result} onOpenChange={(o) => (!o ? setResult(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{result?.created.length ? `${result.created.length} purchase order${result.created.length > 1 ? 's' : ''} created` : 'No purchase orders created'}</DialogTitle>
            <DialogDescription>Orders above your auto-approval limit wait for owner approval; the rest went straight to the supplier.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y text-sm">
            {result?.created.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{p.poNumber}</span> · {p.supplierName} · {p.items} item{p.items > 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular">{formatMoney(p.total)}</span>
                  <StatusBadge status={p.status} />
                </span>
              </li>
            ))}
            {result?.skipped.map((s) => (
              <li key={s.alertId} className="py-2 text-muted-foreground">
                Skipped {s.ingredient}: {s.reason}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button asChild>
              <Link href={purchaseOrdersHref}>Review purchase orders</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CompareDialog({ alert, outletId, onClose }: { alert: ReorderAlert | null; outletId: string | null; onClose: () => void }) {
  const [strategy, setStrategy] = React.useState<Strategy>('BALANCED');
  const [quantity, setQuantity] = React.useState('');
  React.useEffect(() => setQuantity(alert ? String(Number(alert.suggestedQty)) : ''), [alert]);
  const rec = useApi<SupplierRecommendation>(alert ? 'procurement/recommendations' : null, { ingredientId: alert?.ingredientId, quantity: Number(quantity) || undefined, strategy });
  const order = useApiMutation(
    async (o: SupplierOption) => {
      const po = await api.post<{ id: string; poNumber: string }>('procurement/purchase-orders', {
        outletId: alert?.outletId ?? outletId,
        supplierTenantId: o.supplierTenantId,
        items: [{ productId: o.productId, ingredientId: alert?.ingredientId, quantity: o.packs }],
      });
      return api.post<{ poNumber: string; status: string }>(`procurement/purchase-orders/${po.id}/submit`);
    },
    { invalidate: ['procurement/'], success: (p) => `${p.poNumber}: ${humanize(p.status).toLowerCase()}`, onSuccess: onClose },
  );
  const r = rec.data;
  const picks = (o: SupplierOption) => (r ? (Object.entries(r.best) as [Strategy, SupplierOption | null][]).filter(([, b]) => b?.productId === o.productId).map(([k]) => k) : []);

  return (
    <Dialog open={!!alert} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compare suppliers: {alert?.ingredientName}</DialogTitle>
          <DialogDescription>Landed cost includes GST and delivery. Pack sizes are rounded up to meet MOQ.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={`Quantity (${alert?.unit.toLowerCase() ?? ''})`}>
            <Input inputMode="decimal" className="w-32" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Rank by">
            <Select className="w-40" value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
              {SUPPLIER_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="max-h-[50vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-popover text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Supplier</th>
                <th className="py-2 pr-3 text-right font-medium">Packs</th>
                <th className="py-2 pr-3 text-right font-medium">Landed cost</th>
                <th className="py-2 pr-3 text-right font-medium">Per {alert?.unit.toLowerCase()}</th>
                <th className="py-2 pr-3 text-right font-medium">Lead time</th>
                <th className="py-2 pr-3 text-right font-medium">Rating</th>
                <th className="py-2 pr-3 text-right font-medium">On time</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Order</span>
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              {(r?.options ?? []).map((o) => (
                <tr key={o.productId} className="border-b align-top last:border-0">
                  <td className="py-2 pr-3">
                    <p className="font-medium">{o.supplierName}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.productName}
                      {o.brand ? ` · ${o.brand}` : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {picks(o).map((k) => (
                        <Badge key={k} variant="info">
                          {STRATEGY_LABEL[k]}
                        </Badge>
                      ))}
                      {!o.feasible ? <Badge variant="warning">Can't fully supply</Badge> : null}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {o.packs} × {formatNumber(o.packSize, { decimals: true })}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">{formatMoney(o.landedCost)}</td>
                  <td className="py-2 pr-3 text-right">{formatMoney(o.costPerBaseUnit)}</td>
                  <td className="py-2 pr-3 text-right">{o.leadTimeHours < 24 ? `${o.leadTimeHours} h` : `${formatNumber(o.leadTimeHours / 24, { decimals: true })} d`}</td>
                  <td className="py-2 pr-3 text-right">{o.rating.toFixed(1)} ★</td>
                  <td className="py-2 pr-3 text-right">{formatPercent(o.onTimeRate * 100, 0)}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant={o.rank === 1 ? 'default' : 'outline'} onClick={() => order.mutate(o)} loading={order.isPending && order.variables?.productId === o.productId} disabled={!o.feasible}>
                      Order
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {r && !r.options.length ? <p className="py-6 text-center text-sm text-muted-foreground">No supplier in your delivery zone stocks this ingredient.</p> : null}
          {rec.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Comparing suppliers…</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Forecast({ outletId }: { outletId: string | null }) {
  const alerts = useApi<ReorderAlert[]>('procurement/alerts', { outletId: outletId ?? undefined });
  const ingredients = useApi<{ data: { id: string; name: string }[] }>(outletId ? 'inventory/ingredients' : null, { outletId: outletId ?? undefined, pageSize: 100 });
  const options = ingredients.data?.data ?? [];
  const [ingredientId, setIngredientId] = React.useState<string | null>(null);
  const active = ingredientId ?? alerts.data?.[0]?.ingredientId ?? options[0]?.id ?? null;
  const series = useApi<ForecastSeries>(active ? `procurement/forecasts/${active}` : null);
  const s = series.data;
  const unit = s?.ingredient?.unit.toLowerCase() ?? '';

  const data = React.useMemo(() => {
    if (!s) return [];
    const rows: { date: string; actual: number | null; forecast: number | null }[] = s.history.map((h) => ({ date: h.date, actual: h.value, forecast: null }));
    // join the projection to the last actual so the two lines meet
    if (rows.length && s.forecast.length) rows[rows.length - 1]!.forecast = rows[rows.length - 1]!.actual;
    for (const f of s.forecast) if (f.date > (rows.at(-1)?.date ?? '')) rows.push({ date: f.date, actual: null, forecast: f.value });
    return rows;
  }, [s]);
  const horizon = s?.forecast ?? [];
  const totalForecast = horizon.reduce((a, f) => a + f.value, 0);
  const signals = [...new Set(horizon.flatMap((f) => f.signals))];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <TrendChart
        title={s?.ingredient ? `${s.ingredient.name}: daily usage` : 'Daily usage'}
        description={`Last 60 days of consumption and the forecast ahead${unit ? `, in ${unit}` : ''}`}
        data={data}
        xKey="date"
        xFormat={(v) => formatShortDate(String(v))}
        series={[
          { key: 'actual', label: 'Actual', slot: 1 },
          { key: 'forecast', label: 'Forecast', slot: 2, dashed: true },
        ]}
        valueFormat={(v) => formatNumber(v, { decimals: true })}
        loading={series.isFetching}
        actions={
          <Select aria-label="Ingredient" className="h-8 w-48" value={active ?? ''} onChange={(e) => setIngredientId(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        }
      />
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Outlook</CardTitle>
          <CardDescription>{horizon.length ? `Next ${horizon.length} days · ${humanize(horizon[0]!.model)}` : 'No forecast yet'}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {horizon.length ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected usage</span>
                <span className="font-semibold tabular">{qty(totalForecast, unit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">In stock now</span>
                <span className="font-semibold tabular">{s?.ingredient ? qty(s.ingredient.currentStock, unit) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Low – high case</span>
                <span className="tabular">
                  {qty(horizon.reduce((a, f) => a + f.lower, 0), unit)} – {qty(horizon.reduce((a, f) => a + f.upper, 0), unit)}
                </span>
              </div>
              {signals.length ? (
                <div>
                  <p className="mb-1 text-muted-foreground">Signals considered</p>
                  <div className="flex flex-wrap gap-1">
                    {signals.map((sig) => (
                      <Badge key={sig} variant="neutral">
                        {sig}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">Use “Run forecasts” to project demand from history, weekday seasonality, weather and festivals.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsForm() {
  const settings = useApi<Settings>('procurement/settings');
  const [form, setForm] = React.useState<Settings | null>(null);
  React.useEffect(() => setForm(settings.data ?? null), [settings.data]);
  const save = useApiMutation(
    () =>
      api.put('procurement/settings', {
        autoPoEnabled: form!.autoPoEnabled,
        autoApproveBelow: Number(form!.autoApproveBelow),
        defaultStrategy: form!.defaultStrategy,
        forecastHorizonDays: Number(form!.forecastHorizonDays),
        serviceLevel: Number(form!.serviceLevel),
        reviewPeriodDays: Number(form!.reviewPeriodDays),
      }),
    { invalidate: ['procurement/settings'], success: 'Procurement settings saved' },
  );
  if (!form) return <Card className="h-64 animate-pulse" aria-busy />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v });
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Automation</CardTitle>
        <CardDescription>How the engine raises and approves purchase orders for this business.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2">
          <span>
            <span className="block font-medium">Auto-create purchase orders</span>
            <span className="text-sm text-muted-foreground">Raise POs from reorder alerts every morning using the default strategy.</span>
          </span>
          <Switch checked={form.autoPoEnabled} onCheckedChange={(v) => set('autoPoEnabled', v)} aria-label="Auto-create purchase orders" />
        </label>
        <Field label="Auto-approve below (₹)" hint="Larger POs wait for owner approval">
          <Input inputMode="numeric" value={form.autoApproveBelow} onChange={(e) => set('autoApproveBelow', e.target.value)} />
        </Field>
        <Field label="Default supplier strategy">
          <Select value={form.defaultStrategy} onChange={(e) => set('defaultStrategy', e.target.value as Strategy)}>
            {SUPPLIER_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {STRATEGY_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Forecast horizon (days)">
          <Input inputMode="numeric" value={String(form.forecastHorizonDays)} onChange={(e) => set('forecastHorizonDays', Number(e.target.value) || 0)} />
        </Field>
        <Field label="Review period (days)" hint="How much stock each order should cover">
          <Input inputMode="numeric" value={String(form.reviewPeriodDays)} onChange={(e) => set('reviewPeriodDays', Number(e.target.value) || 0)} />
        </Field>
        <Field label="Service level" hint="Target chance of not running out, e.g. 0.95">
          <Input inputMode="decimal" value={String(form.serviceLevel)} onChange={(e) => set('serviceLevel', e.target.value as unknown as number)} />
        </Field>
      </CardContent>
      <CardFooter>
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save settings
        </Button>
      </CardFooter>
    </Card>
  );
}
