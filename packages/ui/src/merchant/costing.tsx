'use client';

import * as React from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { TrendChart } from '../charts';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { DataTable, type Column } from '../components/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { PageHeader, StatGrid } from '../components/layout';
import { StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import { api } from '../lib/api';
import { formatMoney, formatNumber, formatPercent, formatShortDate } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { OutletPicker, useOutlet } from './outlet';
import type { CostingReport, PricingSuggestion, RecipeCost } from './types';

type CostRow = CostingReport['items'][number];
const FLAG_LABEL: Record<string, { status: string; label: string }> = {
  OK: { status: 'IN_STOCK', label: 'Healthy' },
  HIGH_COST: { status: 'HIGH', label: 'High cost' },
  NO_RECIPE: { status: 'DRAFT', label: 'No recipe' },
};

/** Menu engineering: theoretical food cost per dish from recipes × average purchase cost, plus AI price suggestions. */
export function CostingView() {
  const { outletId } = useOutlet();
  const [open, setOpen] = React.useState<CostRow | null>(null);
  const report = useApi<CostingReport>(outletId ? 'inventory/costing' : null, {
    outletId: outletId ?? undefined,
  });
  const r = report.data;

  const columns: Column<CostRow>[] = [
    {
      key: 'name',
      header: 'Dish',
      sortValue: (i) => i.name,
      cell: (i) => <span className="font-medium">{i.name}</span>,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sortValue: (i) => i.sellingPrice,
      cell: (i) => formatMoney(i.sellingPrice, { whole: true }),
    },
    {
      key: 'cost',
      header: 'Food cost',
      align: 'right',
      sortValue: (i) => i.foodCost,
      cell: (i) => (i.foodCost === null ? '—' : formatMoney(i.foodCost)),
    },
    {
      key: 'pct',
      header: 'Food cost %',
      align: 'right',
      sortValue: (i) => i.foodCostPct,
      cell: (i) => formatPercent(i.foodCostPct),
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      sortValue: (i) => i.marginPct,
      cell: (i) => formatPercent(i.marginPct),
    },
    {
      key: 'flag',
      header: 'Status',
      cell: (i) => <StatusBadge {...(FLAG_LABEL[i.flag] ?? { status: i.flag })} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Costing"
        description="Recipe cost at today's average purchase prices"
        actions={<OutletPicker />}
      />
      <StatGrid>
        <StatTile label="Average food cost" value={r ? formatPercent(r.averageFoodCostPct) : '—'} />
        <StatTile label="High-cost dishes" value={r ? formatNumber(r.highCostItems) : '—'} />
        <StatTile
          label="Dishes without a recipe"
          value={r ? formatNumber(r.missingRecipes) : '—'}
        />
        <StatTile label="Dishes on menu" value={r ? formatNumber(r.items.length) : '—'} />
      </StatGrid>
      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_24rem]">
        <DataTable
          caption="Food cost by dish. Select a dish for its recipe breakdown."
          columns={columns}
          rows={r?.items}
          getRowId={(i) => i.menuItemId}
          loading={report.isLoading}
          fetching={report.isFetching}
          onRowClick={(i) => (i.foodCost === null ? undefined : setOpen(i))}
        />
        <PriceSuggestions outletId={outletId} />
      </div>
      <RecipeDialog row={open} onClose={() => setOpen(null)} />
    </>
  );
}

function RecipeDialog({ row, onClose }: { row: CostRow | null; onClose: () => void }) {
  const cost = useApi<RecipeCost>(row ? `inventory/recipes/${row.menuItemId}/cost` : null);
  const trend = useApi<{ date: string; foodCostPct: string }[]>(
    row ? `inventory/costing/trend/${row.menuItemId}` : null,
  );
  const points = (trend.data ?? []).map((t) => ({
    date: t.date.slice(0, 10),
    foodCostPct: Number(t.foodCostPct),
  }));
  return (
    <Dialog open={!!row} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row?.name}</DialogTitle>
          <DialogDescription>
            {cost.data
              ? `${formatMoney(cost.data.perPortion)} per portion · sells at ${formatMoney(row?.sellingPrice, { whole: true })}`
              : 'Loading recipe…'}
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <caption className="sr-only">Recipe cost by ingredient</caption>
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3 font-medium">Ingredient</th>
              <th className="py-2 pr-3 text-right font-medium">Qty</th>
              <th className="py-2 pr-3 text-right font-medium">Cost</th>
              <th className="w-40 py-2 font-medium">Share of cost</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {(cost.data?.lines ?? []).map((l) => (
              <tr key={l.ingredientId} className="border-b last:border-0">
                <td className="py-1.5 pr-3">{l.name}</td>
                <td className="py-1.5 pr-3 text-right">
                  {formatNumber(l.quantity, { decimals: true })} {l.unit.toLowerCase()}
                </td>
                <td className="py-1.5 pr-3 text-right">{formatMoney(l.cost)}</td>
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 rounded-full bg-muted">
                      <span
                        className="block h-2 rounded-full bg-[var(--chart-1)]"
                        style={{ width: `${Math.min(100, l.sharePct)}%` }}
                      />
                    </span>
                    <span className="w-12 text-right text-xs text-muted-foreground">
                      {formatPercent(l.sharePct, 0)}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {points.length > 1 ? (
          <TrendChart
            title="Food cost % over time"
            data={points}
            xKey="date"
            xFormat={(v) => formatShortDate(String(v))}
            series={[{ key: 'foodCostPct', label: 'Food cost %' }]}
            valueFormat={(v) => `${v}%`}
            height={180}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PriceSuggestions({ outletId }: { outletId: string | null }) {
  const list = useApi<PricingSuggestion[]>('ai/pricing/suggestions');
  const mine = (list.data ?? []).filter(
    (s) => !s.factors?.outletId || s.factors.outletId === outletId,
  );
  const run = useApiMutation(
    () =>
      api.post<{ generated: number }>(
        `ai/pricing/menu-suggestions?outletId=${encodeURIComponent(outletId ?? '')}`,
      ),
    {
      invalidate: ['ai/pricing'],
      success: (r) =>
        r.generated
          ? `${r.generated} price suggestions`
          : 'Prices look right — no changes suggested',
    },
  );
  // Applying changes the live menu price first, then records the decision.
  const apply = useApiMutation(
    async (s: PricingSuggestion) => {
      await api.patch(`merchant/items/${s.targetId}`, { price: Number(s.suggestedPrice) });
      return api.post(`ai/pricing/suggestions/${s.id}/apply`);
    },
    { invalidate: ['ai/pricing', 'inventory/costing', 'merchant/'], success: 'Menu price updated' },
  );
  const dismiss = useApiMutation(
    (s: PricingSuggestion) => api.post(`ai/pricing/suggestions/${s.id}/dismiss`),
    { invalidate: ['ai/pricing'] },
  );

  return (
    <Card className="self-start">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>AI price suggestions</CardTitle>
          <CardDescription>
            From price elasticity in your order history, within a ±10% guardrail per change
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => run.mutate()}
          loading={run.isPending}
          disabled={!outletId}
        >
          <Sparkles /> Analyse
        </Button>
      </CardHeader>
      <CardContent>
        {mine.length ? (
          <ul className="divide-y">
            {mine.map((s) => {
              const up = Number(s.suggestedPrice) > Number(s.currentPrice);
              return (
                <li key={s.id} className="grid gap-1 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{s.targetName}</p>
                    <p className="text-right text-sm tabular">
                      <span className="text-muted-foreground line-through">
                        {formatMoney(s.currentPrice, { whole: true })}
                      </span>{' '}
                      <span className="font-semibold">
                        {formatMoney(s.suggestedPrice, { whole: true })}
                      </span>
                      <span className={up ? 'ml-1 text-delta-up' : 'ml-1 text-delta-down'}>
                        {up ? '▲' : '▼'} {formatPercent(Math.abs(s.changePct))}
                      </span>
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.reason} · confidence {formatPercent(s.confidence * 100, 0)}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => apply.mutate(s)}
                      loading={apply.isPending && apply.variables?.id === s.id}
                    >
                      <Check /> Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismiss.mutate(s)}
                      aria-label={`Dismiss suggestion for ${s.targetName}`}
                    >
                      <X /> Dismiss
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {list.isLoading
              ? 'Loading…'
              : 'No open suggestions. Run an analysis to check prices against demand.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
