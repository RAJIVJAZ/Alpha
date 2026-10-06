'use client';

import * as React from 'react';
import { ArrowDownToLine, ClipboardCheck, PackageX, Search, Trash2 } from 'lucide-react';
import { CategoryBarChart } from '../charts';
import { Button } from '../components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import { DataTable, type Column } from '../components/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Select } from '../components/form';
import { FilterBar, PageHeader, StatGrid } from '../components/layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/menu';
import { StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import { api, type Paged } from '../lib/api';
import {
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatShortDate,
  humanize,
  formatQty,
} from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { OutletPicker, useOutlet } from './outlet';
import type { Ingredient, InventorySummary, StockMovement } from './types';

/** Inventory tracked by the user's categories: flour, oil, sugar, dairy, vegetables, packaging, spices, other. */
export const INVENTORY_CATEGORIES = [
  'FLOUR',
  'OIL',
  'SUGAR',
  'DAIRY',
  'VEGETABLES',
  'FRUITS',
  'PACKAGING',
  'SPICES',
  'GRAINS',
  'PULSES',
  'MEAT_SEAFOOD',
  'BEVERAGES',
  'FROZEN',
  'BAKERY',
  'CONDIMENTS',
  'OTHER',
];
const qty = formatQty;

type StockAction = { kind: 'receive' | 'wastage' | 'count'; ingredient: Ingredient } | null;

export function InventoryManager() {
  const { outletId } = useOutlet();
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState<StockAction>(null);
  const summary = useApi<InventorySummary>(outletId ? 'inventory/summary' : null, {
    outletId: outletId ?? undefined,
  });
  const list = useApi<Paged<Ingredient>>(outletId ? 'inventory/ingredients' : null, {
    outletId: outletId ?? undefined,
    category: category || undefined,
    status: status || undefined,
    q: q || undefined,
    page,
    pageSize: 25,
  });
  const s = summary.data;

  const columns: Column<Ingredient>[] = [
    {
      key: 'name',
      header: 'Ingredient',
      sortValue: (i) => i.name,
      cell: (i) => (
        <div>
          <p className="font-medium">{i.name}</p>
          <p className="text-xs text-muted-foreground">
            {humanize(i.category)} · {i.sku}
          </p>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'In stock',
      align: 'right',
      sortValue: (i) => Number(i.currentStock),
      cell: (i) => qty(i.currentStock, i.unit),
    },
    {
      key: 'reorder',
      header: 'Reorder at',
      align: 'right',
      cell: (i) => qty(i.reorderLevel, i.unit),
    },
    {
      key: 'cost',
      header: 'Avg cost',
      align: 'right',
      cell: (i) => `${formatMoney(i.avgUnitCost)}/${i.unit.toLowerCase()}`,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      sortValue: (i) => Number(i.stockValue),
      cell: (i) => formatMoney(i.stockValue, { whole: true }),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => (
        <StatusBadge
          status={
            i.status === 'OK' ? 'IN_STOCK' : i.status === 'LOW' ? 'LOW_STOCK' : 'OUT_OF_STOCK'
          }
          label={i.status === 'OK' ? 'OK' : i.status === 'LOW' ? 'Low' : 'Out'}
        />
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (i) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAction({ kind: 'receive', ingredient: i })}
            aria-label={`Receive ${i.name}`}
          >
            <ArrowDownToLine />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAction({ kind: 'wastage', ingredient: i })}
            aria-label={`Record wastage of ${i.name}`}
          >
            <Trash2 />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAction({ kind: 'count', ingredient: i })}
            aria-label={`Stock count for ${i.name}`}
          >
            <ClipboardCheck />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Live stock from recipes, purchases and wastage"
        actions={<OutletPicker />}
      />
      <StatGrid>
        <StatTile label="Stock value" value={s ? formatMoneyCompact(s.totalValue) : '—'} />
        <StatTile label="Ingredients tracked" value={s ? formatNumber(s.totalItems) : '—'} />
        <StatTile label="Low stock" value={s ? formatNumber(s.lowStock) : '—'} />
        <StatTile
          label="Out of stock"
          value={s ? formatNumber(s.outOfStock) : '—'}
          icon={<PackageX />}
        />
      </StatGrid>

      <Tabs defaultValue="stock" className="mt-6">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="categories">By category</TabsTrigger>
          <TabsTrigger value="expiring">
            Expiring soon {s?.expiringSoon.length ? `(${s.expiringSoon.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">
          <FilterBar>
            <label className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
                aria-hidden
              />
              <span className="sr-only">Search ingredients</span>
              <Input
                className="w-56 pl-8"
                placeholder="Search"
                value={q}
                onChange={(e) => (setQ(e.target.value), setPage(1))}
              />
            </label>
            <Select
              aria-label="Category"
              className="w-44"
              value={category}
              onChange={(e) => (setCategory(e.target.value), setPage(1))}
            >
              <option value="">All categories</option>
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Status"
              className="w-36"
              value={status}
              onChange={(e) => (setStatus(e.target.value), setPage(1))}
            >
              <option value="">Any status</option>
              <option value="LOW">Low</option>
              <option value="OUT">Out</option>
              <option value="OK">OK</option>
            </Select>
          </FilterBar>
          <DataTable
            columns={columns}
            rows={list.data?.data}
            getRowId={(i) => i.id}
            loading={list.isLoading}
            fetching={list.isFetching}
            empty={{ title: 'No ingredients match' }}
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
        </TabsContent>
        <TabsContent value="categories">
          <CategoryBarChart
            title="Stock value by category"
            data={s?.categories
              .map((c) => ({ category: humanize(c.category), value: Math.round(c.value) }))
              .sort((a, b) => b.value - a.value)}
            categoryKey="category"
            series={[{ key: 'value', label: 'Stock value' }]}
            valueFormat={formatMoneyCompact}
            layout="bars"
          />
        </TabsContent>
        <TabsContent value="expiring">
          <Card>
            <CardHeader>
              <CardTitle>Batches expiring in the next days</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {(s?.expiringSoon ?? []).map((b) => (
                  <li key={b.batchId} className="flex justify-between gap-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{b.ingredient}</span> ·{' '}
                      {qty(b.remainingQty, b.unit)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatShortDate(b.expiresAt)} · {formatMoney(b.value, { whole: true })}
                    </span>
                  </li>
                ))}
                {s && !s.expiringSoon.length ? (
                  <li className="py-2 text-sm text-muted-foreground">Nothing expiring soon.</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="movements">
          <Movements outletId={outletId} />
        </TabsContent>
      </Tabs>
      <StockDialog action={action} outletId={outletId} onClose={() => setAction(null)} />
    </>
  );
}

function Movements({ outletId }: { outletId: string | null }) {
  const [type, setType] = React.useState('');
  const [page, setPage] = React.useState(1);
  const list = useApi<Paged<StockMovement>>(outletId ? 'inventory/movements' : null, {
    outletId: outletId ?? undefined,
    type: type || undefined,
    page,
  });
  const columns: Column<StockMovement>[] = [
    { key: 'when', header: 'When', cell: (m) => formatDateTime(m.createdAt) },
    { key: 'ing', header: 'Ingredient', cell: (m) => m.ingredient?.name ?? '—' },
    { key: 'type', header: 'Type', cell: (m) => humanize(m.type) },
    {
      key: 'qty',
      header: 'Quantity',
      align: 'right',
      cell: (m) => qty(m.quantity, m.ingredient?.unit ?? ''),
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      cell: (m) => (m.totalCost ? formatMoney(m.totalCost) : '—'),
    },
    {
      key: 'bal',
      header: 'Balance',
      align: 'right',
      cell: (m) => qty(m.balanceAfter, m.ingredient?.unit ?? ''),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (m) => <span className="text-sm text-muted-foreground">{m.reason ?? '—'}</span>,
    },
  ];
  return (
    <>
      <FilterBar>
        <Select
          aria-label="Movement type"
          className="w-44"
          value={type}
          onChange={(e) => (setType(e.target.value), setPage(1))}
        >
          <option value="">All movements</option>
          {['PURCHASE', 'CONSUMPTION', 'WASTAGE', 'ADJUSTMENT', 'OPENING'].map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(m) => m.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        pagination={
          list.data
            ? { page, totalPages: list.data.meta.totalPages, onPageChange: setPage }
            : undefined
        }
      />
    </>
  );
}

function StockDialog({
  action,
  outletId,
  onClose,
}: {
  action: StockAction;
  outletId: string | null;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = React.useState('');
  const [cost, setCost] = React.useState('');
  const [reason, setReason] = React.useState('');
  React.useEffect(() => {
    setQuantity(action?.kind === 'count' ? String(Number(action.ingredient.currentStock)) : '');
    setCost(action ? String(Number(action.ingredient.avgUnitCost).toFixed(2)) : '');
    setReason(
      action?.kind === 'wastage' ? 'Spoiled' : action?.kind === 'count' ? 'Weekly stock count' : '',
    );
  }, [action]);
  const submit = useApiMutation(
    () => {
      const i = action!.ingredient;
      if (action!.kind === 'receive')
        return api.post('inventory/stock/receive', {
          outletId,
          lines: [{ ingredientId: i.id, quantity: Number(quantity), unitCost: Number(cost) }],
          note: reason || undefined,
        });
      if (action!.kind === 'wastage')
        return api.post('inventory/stock/wastage', {
          ingredientId: i.id,
          quantity: Number(quantity),
          reason,
        });
      return api.post('inventory/stock/adjust', {
        ingredientId: i.id,
        countedQuantity: Number(quantity),
        reason,
      });
    },
    { invalidate: ['inventory/'], success: 'Stock updated', onSuccess: onClose },
  );
  if (!action) return null;
  const i = action.ingredient;
  const titles = {
    receive: `Receive ${i.name}`,
    wastage: `Record wastage: ${i.name}`,
    count: `Stock count: ${i.name}`,
  };
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[action.kind]}</DialogTitle>
          <DialogDescription>Currently {qty(i.currentStock, i.unit)} in stock.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), submit.mutate())}>
          <Field
            label={
              action.kind === 'count'
                ? `Counted quantity (${i.unit.toLowerCase()})`
                : `Quantity (${i.unit.toLowerCase()})`
            }
          >
            <Input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </Field>
          {action.kind === 'receive' ? (
            <Field label={`Cost per ${i.unit.toLowerCase()} (₹, before GST)`}>
              <Input
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                required
              />
            </Field>
          ) : null}
          <Field label={action.kind === 'receive' ? 'Note' : 'Reason'}>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={action.kind !== 'receive'}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={submit.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
