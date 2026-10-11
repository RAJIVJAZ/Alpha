'use client';

import * as React from 'react';
import {
  ArrowDownToLine,
  ClipboardCheck,
  PackageX,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
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
import { useCan } from './access';
import { ingredientBody, skuFromName, type IngredientForm } from './forms';
import { OutletPicker, useOutlet } from './outlet';
import type { Ingredient, IngredientDetail, InventorySummary, StockMovement } from './types';

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
const STOCK_UNITS = ['KG', 'G', 'L', 'ML', 'PCS', 'PACK', 'DOZEN', 'BOX'];
const qty = formatQty;

type StockAction = { kind: 'receive' | 'wastage' | 'count'; ingredient: Ingredient } | null;

export function InventoryManager() {
  const { outletId } = useOutlet();
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState<StockAction>(null);
  const [editing, setEditing] = React.useState<Ingredient | 'new' | null>(null);
  const canManage = useCan('inventory:manage');
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
  ];
  if (canManage)
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (i) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(i)}
            aria-label={`Edit ${i.name}`}
          >
            <Pencil />
          </Button>
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
    });

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Live stock from recipes, purchases and wastage"
        actions={
          <>
            <OutletPicker />
            {canManage && outletId ? (
              <Button onClick={() => setEditing('new')}>
                <Plus /> Ingredient
              </Button>
            ) : null}
          </>
        }
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
      {editing && outletId ? (
        <IngredientDialog
          ingredient={editing === 'new' ? null : editing}
          outletId={outletId}
          onClose={() => setEditing(null)}
        />
      ) : null}
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

const EMPTY_INGREDIENT: IngredientForm = {
  name: '',
  sku: '',
  category: 'OTHER',
  unit: 'KG',
  reorderLevel: '',
  reorderQty: '',
  maxStock: '',
  leadTimeDays: '2',
  shelfLifeDays: '',
  openingStock: '',
  openingUnitCost: '',
};

/** Create an ingredient, or edit the master data of `ingredient`. */
function IngredientDialog({
  ingredient,
  outletId,
  onClose,
}: {
  ingredient: Ingredient | null;
  outletId: string;
  onClose: () => void;
}) {
  const detail = useApi<IngredientDetail>(
    ingredient ? `inventory/ingredients/${ingredient.id}` : null,
  );
  const d = detail.data;
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ingredient ? `Edit ${ingredient.name}` : 'New ingredient'}</DialogTitle>
          <DialogDescription>
            Reorder level, max stock and lead time drive low-stock alerts and purchase forecasts.
          </DialogDescription>
        </DialogHeader>
        {!ingredient ? (
          <IngredientFormBody initial={EMPTY_INGREDIENT} outletId={outletId} onDone={onClose} />
        ) : d ? (
          <IngredientFormBody
            initial={{
              ...EMPTY_INGREDIENT,
              name: d.name,
              sku: d.sku,
              category: d.category,
              unit: d.unit,
              reorderLevel: String(Number(d.reorderLevel)),
              reorderQty: String(Number(d.reorderQty)),
              maxStock: d.maxStock === null ? '' : String(Number(d.maxStock)),
              leadTimeDays: String(d.leadTimeDays),
              shelfLifeDays: d.shelfLifeDays === null ? '' : String(d.shelfLifeDays),
            }}
            existing={d}
            onDone={onClose}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IngredientFormBody({
  initial,
  outletId,
  existing,
  onDone,
}: {
  initial: IngredientForm;
  outletId?: string;
  existing?: IngredientDetail;
  onDone: () => void;
}) {
  const [f, setF] = React.useState(initial);
  const [skuEdited, setSkuEdited] = React.useState(!!existing);
  const set = (k: keyof IngredientForm) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const save = useApiMutation(
    () =>
      existing
        ? api.patch(`inventory/ingredients/${existing.id}`, ingredientBody(f))
        : api.post('inventory/ingredients', ingredientBody(f, outletId)),
    {
      invalidate: ['inventory/'],
      success: existing ? `${f.name} updated` : `${f.name} added`,
      onSuccess: onDone,
    },
  );
  const unit = f.unit.toLowerCase();
  const amount = { type: 'number', min: 0, step: 'any', inputMode: 'decimal' } as const;
  return (
    <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input
            value={f.name}
            maxLength={120}
            required
            onChange={(e) =>
              setF((p) => ({
                ...p,
                name: e.target.value,
                sku: skuEdited ? p.sku : skuFromName(e.target.value),
              }))
            }
          />
        </Field>
        <Field label="SKU" hint="Your code for this item; unique at the outlet">
          <Input
            value={f.sku}
            maxLength={40}
            required
            onChange={(e) => (setSkuEdited(true), set('sku')(e))}
          />
        </Field>
        <Field label="Category">
          <Select value={f.category} onChange={set('category')}>
            {INVENTORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Stock unit"
          hint={existing ? 'Fixed: stock and recipes are counted in it' : undefined}
        >
          <Select value={f.unit} onChange={set('unit')} disabled={!!existing}>
            {STOCK_UNITS.map((u) => (
              <option key={u} value={u}>
                {u.toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Reorder level (${unit})`} hint="Alert when stock falls to this">
          <Input {...amount} value={f.reorderLevel} onChange={set('reorderLevel')} />
        </Field>
        <Field label={`Reorder quantity (${unit})`} hint="Smallest order to place">
          <Input {...amount} value={f.reorderQty} onChange={set('reorderQty')} />
        </Field>
        <Field label={`Max stock (${unit})`} hint="Orders never go above it">
          <Input {...amount} value={f.maxStock} onChange={set('maxStock')} />
        </Field>
        <Field label="Supplier lead time (days)">
          <Input
            type="number"
            min={0}
            max={60}
            step={1}
            inputMode="numeric"
            value={f.leadTimeDays}
            onChange={set('leadTimeDays')}
          />
        </Field>
        <Field label="Shelf life (days)" hint="Sets batch expiry on receipt">
          <Input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={f.shelfLifeDays}
            onChange={set('shelfLifeDays')}
          />
        </Field>
      </div>
      {existing ? (
        <p className="text-sm text-muted-foreground">
          Average cost {formatMoney(existing.avgUnitCost)}/{unit} · it moves with each delivery you
          receive.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={`Cost per ${unit} (₹, before GST)`}
            hint="Prices recipes until stock arrives"
          >
            <Input {...amount} value={f.openingUnitCost} onChange={set('openingUnitCost')} />
          </Field>
          <Field label={`Opening stock (${unit})`} hint="What you have on hand today">
            <Input {...amount} value={f.openingStock} onChange={set('openingStock')} />
          </Field>
        </div>
      )}
      <DialogFooter>
        <Button type="submit" loading={save.isPending}>
          {existing ? 'Save' : 'Add ingredient'}
        </Button>
      </DialogFooter>
    </form>
  );
}
