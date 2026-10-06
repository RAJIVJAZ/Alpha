'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarPlus, ChefHat, CheckCircle2, Play } from 'lucide-react';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { DataTable, type Column } from '../components/data-table';
import { Field, Input } from '../components/form';
import { EmptyState, PageHeader } from '../components/layout';
import { StatusBadge } from '../components/status';
import { api } from '../lib/api';
import { formatDate, formatNumber, istDate } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { cn } from '../lib/utils';
import { OutletPicker, useOutlet } from './outlet';
import type { ProductionPlan, ProductionPlanItem } from './types';

type PlanRow = ProductionPlan & { _count?: { items: number } };
const n = (v: string | number) => formatNumber(Number(v), { decimals: true });

/**
 * Production planning: forecast tomorrow's dish volumes from 4 weeks of sales,
 * adjust the batch sizes, check ingredient shortages, then run the plan.
 */
export function ProductionPlanner({ procurementHref }: { procurementHref?: string }) {
  const { outletId } = useOutlet();
  const [date, setDate] = React.useState(() => istDate(1));
  const [buffer, setBuffer] = React.useState('10');
  const [selected, setSelected] = React.useState<string | null>(null);
  const plans = useApi<PlanRow[]>(outletId ? 'inventory/production-plans' : null, {
    outletId: outletId ?? undefined,
  });

  React.useEffect(() => setSelected(null), [outletId]);
  const activeId = selected ?? plans.data?.[0]?.id ?? null;

  const generate = useApiMutation(
    () =>
      api.post<ProductionPlan>('inventory/production-plans/generate', {
        outletId,
        date,
        bufferPct: Number(buffer) || 0,
      }),
    {
      invalidate: ['inventory/production-plans'],
      success: (p) => `Plan drafted with ${p.items.length} dishes`,
      onSuccess: (p) => setSelected(p.id),
    },
  );

  return (
    <>
      <PageHeader
        title="Production planning"
        description="Batch quantities forecast from the last 4 weeks of sales, by weekday"
        actions={<OutletPicker />}
      />
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>New plan</CardTitle>
              <CardDescription>Regenerating a draft replaces it.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3"
                onSubmit={(e) => (e.preventDefault(), generate.mutate())}
              >
                <Field label="Production date">
                  <Input
                    type="date"
                    value={date}
                    min={istDate(0)}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Safety buffer (%)" hint="Added on top of the forecast">
                  <Input
                    inputMode="numeric"
                    value={buffer}
                    onChange={(e) => setBuffer(e.target.value)}
                  />
                </Field>
                <Button type="submit" loading={generate.isPending} disabled={!outletId}>
                  <CalendarPlus /> Generate plan
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent plans</CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              {plans.data?.length ? (
                <ul className="grid gap-1">
                  {plans.data.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(p.id)}
                        aria-current={p.id === activeId ? 'true' : undefined}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted',
                          p.id === activeId && 'bg-accent text-accent-foreground',
                        )}
                      >
                        <span>
                          <span className="font-medium">{formatDate(p.planDate)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {p._count?.items ?? p.items?.length ?? 0} dishes
                          </span>
                        </span>
                        <StatusBadge status={p.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 pb-2 text-sm text-muted-foreground">
                  {plans.isLoading ? 'Loading…' : 'No plans yet.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        {activeId ? (
          <PlanDetail id={activeId} procurementHref={procurementHref} />
        ) : (
          <EmptyState
            icon={<ChefHat />}
            title="No production plan yet"
            description="Generate one for tomorrow to see batch sizes and ingredient needs."
          />
        )}
      </div>
    </>
  );
}

function PlanDetail({ id, procurementHref }: { id: string; procurementHref?: string }) {
  const plan = useApi<ProductionPlan>(`inventory/production-plans/${id}`);
  const p = plan.data;
  const move = useApiMutation(
    (to: 'confirm' | 'start' | 'complete') => api.post(`inventory/production-plans/${id}/${to}`),
    {
      invalidate: ['inventory/production-plans'],
      success: 'Plan updated',
    },
  );
  if (!p) return <Card className="min-h-64 animate-pulse" aria-busy />;

  const editable = p.status !== 'COMPLETED' && p.status !== 'CANCELLED';
  const shortages = (p.requirements ?? []).filter((r) => r.shortage > 0);
  const columns: Column<ProductionPlanItem>[] = [
    {
      key: 'name',
      header: 'Dish',
      sortValue: (i) => i.name,
      cell: (i) => <span className="font-medium">{i.name}</span>,
    },
    {
      key: 'forecast',
      header: 'Forecast',
      align: 'right',
      sortValue: (i) => Number(i.forecastQty),
      cell: (i) => n(i.forecastQty),
    },
    {
      key: 'planned',
      header: 'Planned',
      align: 'right',
      sortValue: (i) => Number(i.plannedQty),
      cell: (i) =>
        editable && p.status !== 'IN_PROGRESS' ? (
          <QtyInput planId={p.id} item={i} field="plannedQty" />
        ) : (
          n(i.plannedQty)
        ),
    },
    {
      key: 'produced',
      header: 'Produced',
      align: 'right',
      cell: (i) =>
        p.status === 'IN_PROGRESS' ? (
          <QtyInput planId={p.id} item={i} field="producedQty" />
        ) : p.status === 'COMPLETED' ? (
          n(i.producedQty)
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="grid content-start gap-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Plan for {formatDate(p.planDate)}</CardTitle>
            <CardDescription>
              {p.items.length} dishes · {n(p.items.reduce((s, i) => s + Number(i.plannedQty), 0))}{' '}
              portions planned
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={p.status} />
            {p.status === 'DRAFT' ? (
              <Button size="sm" onClick={() => move.mutate('confirm')} loading={move.isPending}>
                <CheckCircle2 /> Confirm
              </Button>
            ) : null}
            {p.status === 'CONFIRMED' ? (
              <Button size="sm" onClick={() => move.mutate('start')} loading={move.isPending}>
                <Play /> Start production
              </Button>
            ) : null}
            {p.status === 'IN_PROGRESS' ? (
              <Button size="sm" onClick={() => move.mutate('complete')} loading={move.isPending}>
                <CheckCircle2 /> Complete
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={p.items}
            getRowId={(i) => i.id}
            empty={{ title: 'No sales history to plan from' }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ingredients needed</CardTitle>
          <CardDescription>From recipes × planned portions, against current stock</CardDescription>
        </CardHeader>
        <CardContent>
          {shortages.length ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-serious/40 bg-status-serious/10 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4" aria-hidden />
                {shortages.length} ingredient{shortages.length > 1 ? 's' : ''} short for this plan
              </span>
              {procurementHref ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={procurementHref}>Open procurement</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">Ingredient</th>
                  <th className="py-2 pr-3 text-right font-medium">Required</th>
                  <th className="py-2 pr-3 text-right font-medium">In stock</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {(p.requirements ?? []).map((r) => (
                  <tr key={r.ingredientId} className="border-b last:border-0">
                    <td className="py-2 pr-3">{r.name}</td>
                    <td className="py-2 pr-3 text-right">
                      {n(r.required)} {r.unit.toLowerCase()}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {n(r.currentStock)} {r.unit.toLowerCase()}
                    </td>
                    <td className="py-2">
                      {r.shortage > 0 ? (
                        <StatusBadge
                          status="OUT_OF_STOCK"
                          label={`Short ${n(r.shortage)} ${r.unit.toLowerCase()}`}
                        />
                      ) : (
                        <StatusBadge status="IN_STOCK" label="Enough" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Inline quantity editor; saves on blur or Enter. */
function QtyInput({
  planId,
  item,
  field,
}: {
  planId: string;
  item: ProductionPlanItem;
  field: 'plannedQty' | 'producedQty';
}) {
  const initial = String(Number(item[field]));
  const [value, setValue] = React.useState(initial);
  React.useEffect(() => setValue(initial), [initial]);
  const save = useApiMutation(
    (qty: number) =>
      api.patch(`inventory/production-plans/${planId}/items/${item.id}`, { [field]: qty }),
    { invalidate: [`inventory/production-plans/${planId}`] },
  );
  const commit = () => {
    const qty = Number(value);
    if (value === initial || !Number.isFinite(qty) || qty < 0) return setValue(initial);
    save.mutate(qty);
  };
  return (
    <Input
      aria-label={`${field === 'plannedQty' ? 'Planned' : 'Produced'} quantity for ${item.name}`}
      inputMode="decimal"
      className="ml-auto h-8 w-20 text-right tabular"
      value={value}
      disabled={save.isPending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) =>
        e.key === 'Enter' ? (e.currentTarget as HTMLInputElement).blur() : undefined
      }
    />
  );
}
