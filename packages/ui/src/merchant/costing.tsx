'use client';

import * as React from 'react';
import { Check, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { TrendChart } from '../charts';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { DataTable, type Column } from '../components/data-table';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { PageHeader, StatGrid } from '../components/layout';
import { StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import { api, type Paged } from '../lib/api';
import { formatMoney, formatNumber, formatPercent, formatShortDate } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { useCan } from './access';
import { recipeLines, recipeUnits, type RecipeLineForm } from './forms';
import { OutletPicker, useOutlet } from './outlet';
import type { CostingReport, Ingredient, PricingSuggestion, Recipe, RecipeCost } from './types';

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
  const [editing, setEditing] = React.useState<CostRow | null>(null);
  const canEditRecipes = useCan('recipes:manage');
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
  if (canEditRecipes)
    columns.push({
      key: 'recipe',
      header: <span className="sr-only">Recipe</span>,
      align: 'right',
      cell: (i) => (
        <Button
          size="sm"
          variant={i.foodCost === null ? 'outline' : 'ghost'}
          // the row opens the cost breakdown; this button opens the editor instead
          onClick={(e) => (e.stopPropagation(), setEditing(i))}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={`${i.foodCost === null ? 'Add' : 'Edit'} recipe for ${i.name}`}
        >
          {i.foodCost === null ? 'Add recipe' : 'Edit recipe'}
        </Button>
      ),
    });

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
      {editing && outletId ? (
        <RecipeEditor row={editing} outletId={outletId} onClose={() => setEditing(null)} />
      ) : null}
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

/** Build or change a dish's recipe (bill of materials): it drives food cost and stock deduction. */
function RecipeEditor({
  row,
  outletId,
  onClose,
}: {
  row: CostRow;
  outletId: string;
  onClose: () => void;
}) {
  const recipes = useApi<Recipe[]>('inventory/recipes', { outletId });
  const ingredients = useApi<Paged<Ingredient>>('inventory/ingredients', {
    outletId,
    pageSize: 500,
  });
  const ready = recipes.data && ingredients.data;
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recipe: {row.name}</DialogTitle>
          <DialogDescription>
            Ingredients for one batch. Each order deducts them from stock and prices the dish.
          </DialogDescription>
        </DialogHeader>
        {ready ? (
          <RecipeForm
            row={row}
            outletId={outletId}
            recipe={recipes.data!.find((r) => r.menuItemId === row.menuItemId)}
            ingredients={ingredients.data!.data}
            onDone={onClose}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

const NEW_LINE: RecipeLineForm = { ingredientId: '', quantity: '', unit: '', wastagePct: '' };

function RecipeForm({
  row,
  outletId,
  recipe,
  ingredients,
  onDone,
}: {
  row: CostRow;
  outletId: string;
  recipe: Recipe | undefined;
  ingredients: Ingredient[];
  onDone: () => void;
}) {
  const [lines, setLines] = React.useState<RecipeLineForm[]>(
    recipe?.lines.map((l) => ({
      ingredientId: l.ingredientId,
      quantity: String(Number(l.quantity)),
      unit: l.unit,
      wastagePct: Number(l.wastagePct) ? String(Number(l.wastagePct)) : '',
    })) ?? [NEW_LINE],
  );
  const [yieldQty, setYieldQty] = React.useState(recipe ? String(Number(recipe.yieldQty)) : '1');
  const [prepTime, setPrepTime] = React.useState(recipe?.prepTimeMins?.toString() ?? '');
  const [instructions, setInstructions] = React.useState(recipe?.instructions ?? '');
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const update = (n: number, patch: Partial<RecipeLineForm>) =>
    setLines((ls) => ls.map((l, i) => (i === n ? { ...l, ...patch } : l)));
  const save = useApiMutation(
    () =>
      api.put('inventory/recipes', {
        outletId,
        menuItemId: row.menuItemId,
        name: row.name,
        yieldQty: Number(yieldQty),
        prepTimeMins: prepTime ? Number(prepTime) : undefined,
        instructions: instructions.trim() || undefined,
        lines: recipeLines(lines),
      }),
    { invalidate: ['inventory/'], success: `Recipe saved for ${row.name}`, onSuccess: onDone },
  );
  const remove = useApiMutation(() => api.delete(`inventory/recipes/${row.menuItemId}`), {
    invalidate: ['inventory/'],
    success: `Recipe removed from ${row.name}`,
    onSuccess: onDone,
  });

  if (!ingredients.length)
    return (
      <p className="text-sm text-muted-foreground">
        No ingredients at this outlet yet. Add them in Inventory first, then build the recipe.
      </p>
    );
  return (
    <>
      <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Ingredients</legend>
          {lines.map((l, n) => {
            const ing = byId.get(l.ingredientId);
            const label = ing?.name ?? `line ${n + 1}`;
            return (
              <div key={n} className="grid grid-cols-[1fr_6rem_5rem_5rem_auto] items-center gap-2">
                <Select
                  aria-label={`Ingredient ${n + 1}`}
                  required
                  value={l.ingredientId}
                  onChange={(e) => {
                    const next = byId.get(e.target.value);
                    update(n, { ingredientId: e.target.value, unit: recipeUnits(next!.unit)[0]! });
                  }}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={`Quantity of ${label}`}
                  type="number"
                  min={0.0001}
                  step="any"
                  inputMode="decimal"
                  required
                  value={l.quantity}
                  onChange={(e) => update(n, { quantity: e.target.value })}
                />
                <Select
                  aria-label={`Unit for ${label}`}
                  value={l.unit}
                  onChange={(e) => update(n, { unit: e.target.value })}
                >
                  {(ing ? recipeUnits(ing.unit) : [l.unit]).map((u) => (
                    <option key={u} value={u}>
                      {u.toLowerCase()}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={`Wastage % for ${label}`}
                  placeholder="Waste %"
                  type="number"
                  min={0}
                  max={80}
                  step="any"
                  inputMode="decimal"
                  value={l.wastagePct}
                  onChange={(e) => update(n, { wastagePct: e.target.value })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${label}`}
                  onClick={() => setLines((ls) => ls.filter((_, i) => i !== n))}
                >
                  <X />
                </Button>
              </div>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="justify-self-start"
            onClick={() => setLines((ls) => [...ls, NEW_LINE])}
          >
            <Plus /> Ingredient
          </Button>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Portions made" hint="The quantities above make this many plates">
            <Input
              type="number"
              min={0.01}
              step="any"
              inputMode="decimal"
              required
              value={yieldQty}
              onChange={(e) => setYieldQty(e.target.value)}
            />
          </Field>
          <Field label="Prep time (minutes)">
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Method">
          <Textarea
            maxLength={4000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </Field>
        <DialogFooter>
          {recipe ? (
            <Button
              type="button"
              variant="ghost"
              className="sm:mr-auto"
              onClick={() => setConfirmRemove(true)}
            >
              <Trash2 /> Remove recipe
            </Button>
          ) : null}
          <Button type="submit" loading={save.isPending}>
            Save recipe
          </Button>
        </DialogFooter>
      </form>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove the recipe for ${row.name}?`}
        description="Orders will stop deducting its ingredients and the dish will show no food cost."
        confirmLabel="Remove recipe"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
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
