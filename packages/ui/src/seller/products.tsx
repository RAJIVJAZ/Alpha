'use client';

import * as React from 'react';
import { Layers, PackagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../components/button';
import { Thumb } from '../components/thumb';
import { DataTable, type Column } from '../components/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { FilterBar, PageHeader } from '../components/layout';
import { Switch } from '../components/menu';
import { StatusBadge } from '../components/status';
import { api, type Paged } from '../lib/api';
import { formatMoney, formatNumber, humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import {
  BUYER_SEGMENTS,
  GST_RATES,
  STOCK_UNITS,
  type BuyerSegment,
  type MarketplaceCategory,
  type PriceTier,
  type SellerProduct,
} from './types';

const n = (v: string | number | null | undefined) =>
  formatNumber(Number(v ?? 0), { decimals: true });
const packLabel = (p: Pick<SellerProduct, 'packSize' | 'unit'>) =>
  `${n(p.packSize)} ${p.unit.toLowerCase()}`;

/**
 * Product catalogue for suppliers, wholesalers and retailers: listing,
 * pricing, MOQ, bulk price tiers and stock.
 */
export function ProductCatalog({
  title = 'Products',
  description = 'What buyers see in the marketplace: price, MOQ, delivery time and stock',
}: {
  title?: string;
  description?: string;
}) {
  const [q, setQ] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState<SellerProduct | 'new' | null>(null);
  const [tiers, setTiers] = React.useState<SellerProduct | null>(null);
  const categories = useApi<MarketplaceCategory[]>('marketplace/categories');
  const list = useApi<Paged<SellerProduct>>('seller/products', {
    q: q || undefined,
    category: category || undefined,
    page,
    pageSize: 25,
  });
  const toggle = useApiMutation(
    (p: SellerProduct) => api.patch(`seller/products/${p.id}`, { isActive: !p.isActive }),
    { invalidate: ['seller/products'] },
  );

  const columns: Column<SellerProduct>[] = [
    {
      key: 'name',
      header: 'Product',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <Thumb src={p.images[0]} className="size-10" />
          <div>
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {p.sku}
              {p.brand ? ` · ${p.brand}` : ''} · {p.category?.name}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price / pack',
      align: 'right',
      sortValue: (p) => Number(p.price),
      cell: (p) => (
        <div>
          <p>{formatMoney(p.price)}</p>
          <p className="text-xs text-muted-foreground">
            {packLabel(p)} · GST {n(p.gstRate)}%
          </p>
        </div>
      ),
    },
    {
      key: 'moq',
      className: 'whitespace-nowrap',
      header: 'MOQ',
      align: 'right',
      cell: (p) => `${n(p.moq)} pack${Number(p.moq) === 1 ? '' : 's'}`,
    },
    {
      key: 'tiers',
      className: 'whitespace-nowrap',
      header: 'Bulk tiers',
      align: 'right',
      cell: (p) =>
        p.priceTiers.length
          ? `${p.priceTiers.length} from ${formatMoney(Math.min(...p.priceTiers.map((t) => Number(t.unitPrice))))}`
          : '—',
    },
    {
      key: 'lead',
      className: 'whitespace-nowrap',
      header: 'Delivery',
      align: 'right',
      cell: (p) =>
        p.deliveryTimeHours < 24 ? `${p.deliveryTimeHours} h` : `${n(p.deliveryTimeHours / 24)} d`,
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      sortValue: (p) => Number(p.stockQty),
      cell: (p) => <StockCell product={p} />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => <StatusBadge status={p.stockStatus} label={humanize(p.stockStatus)} />,
    },
    {
      key: 'active',
      header: 'Listed',
      cell: (p) => (
        <Switch
          checked={p.isActive}
          onCheckedChange={() => toggle.mutate(p)}
          aria-label={`${p.isActive ? 'Unlist' : 'List'} ${p.name}`}
        />
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTiers(p)}
            aria-label={`Bulk pricing for ${p.name}`}
          >
            <Layers />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(p)}
            aria-label={`Edit ${p.name}`}
          >
            <Pencil />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <PackagePlus /> Add product
          </Button>
        }
      />
      <FilterBar>
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search products</span>
          <Input
            className="w-60 pl-8"
            placeholder="Name, SKU or brand"
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
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(p) => p.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        empty={{
          title: 'No products yet',
          description: 'Add your first product to start selling in the marketplace.',
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
      {editing ? (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {tiers ? <TiersDialog product={tiers} onClose={() => setTiers(null)} /> : null}
    </>
  );
}

/** Inline stock editor; saves on blur or Enter. */
function StockCell({ product }: { product: SellerProduct }) {
  const initial = String(Number(product.stockQty));
  const [value, setValue] = React.useState(initial);
  React.useEffect(() => setValue(initial), [initial]);
  const save = useApiMutation(
    (stockQty: number) => api.patch(`seller/products/${product.id}/stock`, { stockQty }),
    { invalidate: ['seller/products'], success: `${product.name}: stock updated` },
  );
  const commit = () => {
    const qty = Number(value);
    if (value === initial || !Number.isFinite(qty) || qty < 0) return setValue(initial);
    save.mutate(qty);
  };
  return (
    <Input
      aria-label={`Stock of ${product.name} (packs)`}
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

type Form = Record<
  | 'categoryCode'
  | 'name'
  | 'sku'
  | 'brand'
  | 'description'
  | 'image'
  | 'unit'
  | 'packSize'
  | 'price'
  | 'mrp'
  | 'moq'
  | 'maxOrderQty'
  | 'stepQty'
  | 'gstRate'
  | 'hsnCode'
  | 'deliveryTimeHours'
  | 'stockQty'
  | 'lowStockThreshold',
  string
>;

function ProductDialog({
  product: p,
  categories,
  onClose,
}: {
  product: SellerProduct | null;
  categories: MarketplaceCategory[];
  onClose: () => void;
}) {
  const [f, setF] = React.useState<Form>(() => ({
    categoryCode: p?.category?.code ?? categories[0]?.code ?? '',
    name: p?.name ?? '',
    sku: p?.sku ?? '',
    brand: p?.brand ?? '',
    description: p?.description ?? '',
    image: p?.images[0] ?? '',
    unit: p?.unit ?? 'KG',
    packSize: p ? String(Number(p.packSize)) : '1',
    price: p ? String(Number(p.price)) : '',
    mrp: p?.mrp ? String(Number(p.mrp)) : '',
    moq: p ? String(Number(p.moq)) : '1',
    maxOrderQty: p?.maxOrderQty ? String(Number(p.maxOrderQty)) : '',
    stepQty: p ? String(Number(p.stepQty)) : '1',
    gstRate: p ? String(Number(p.gstRate)) : '5',
    hsnCode: p?.hsnCode ?? '',
    deliveryTimeHours: p ? String(p.deliveryTimeHours) : '24',
    stockQty: p ? String(Number(p.stockQty)) : '0',
    lowStockThreshold: p ? String(Number(p.lowStockThreshold)) : '10',
  }));
  const set =
    (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const save = useApiMutation(
    () => {
      const body = {
        categoryCode: f.categoryCode,
        name: f.name.trim(),
        brand: f.brand.trim() || undefined,
        description: f.description.trim() || undefined,
        images: f.image.trim() ? [f.image.trim()] : [],
        unit: f.unit,
        packSize: num(f.packSize),
        price: Number(f.price),
        mrp: num(f.mrp),
        moq: num(f.moq),
        maxOrderQty: num(f.maxOrderQty),
        stepQty: num(f.stepQty),
        gstRate: Number(f.gstRate),
        hsnCode: f.hsnCode.trim() || undefined,
        deliveryTimeHours: num(f.deliveryTimeHours),
        stockQty: num(f.stockQty),
        lowStockThreshold: num(f.lowStockThreshold),
      };
      return p
        ? api.patch(`seller/products/${p.id}`, body)
        : api.post('seller/products', { ...body, sku: f.sku.trim() });
    },
    {
      invalidate: ['seller/products'],
      success: p ? 'Product updated' : 'Product listed',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{p ? `Edit ${p.name}` : 'Add product'}</DialogTitle>
          <DialogDescription>
            Prices are per pack, before GST. MOQ and step are in packs.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), save.mutate())}
        >
          <Field label="Name" className="sm:col-span-2">
            <Input value={f.name} onChange={set('name')} required maxLength={160} />
          </Field>
          <Field label="SKU" hint={p ? 'SKU cannot change' : undefined}>
            <Input value={f.sku} onChange={set('sku')} required disabled={!!p} maxLength={64} />
          </Field>
          <Field label="Brand">
            <Input value={f.brand} onChange={set('brand')} />
          </Field>
          <Field label="Category">
            <Select value={f.categoryCode} onChange={set('categoryCode')} required>
              {categories.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Image URL">
            <Input type="url" value={f.image} onChange={set('image')} placeholder="https://" />
          </Field>
          <Field label="Pack size">
            <Input inputMode="decimal" value={f.packSize} onChange={set('packSize')} required />
          </Field>
          <Field label="Unit">
            <Select value={f.unit} onChange={set('unit')}>
              {STOCK_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u.toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Price per pack (₹)">
            <Input inputMode="decimal" value={f.price} onChange={set('price')} required />
          </Field>
          <Field label="MRP (₹)">
            <Input inputMode="decimal" value={f.mrp} onChange={set('mrp')} />
          </Field>
          <Field label="GST rate">
            <Select value={f.gstRate} onChange={set('gstRate')}>
              {GST_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </Select>
          </Field>
          <Field label="HSN code">
            <Input value={f.hsnCode} onChange={set('hsnCode')} inputMode="numeric" />
          </Field>
          <Field label="Minimum order (packs)">
            <Input inputMode="decimal" value={f.moq} onChange={set('moq')} />
          </Field>
          <Field label="Order in steps of (packs)">
            <Input inputMode="decimal" value={f.stepQty} onChange={set('stepQty')} />
          </Field>
          <Field label="Maximum per order (packs)">
            <Input
              inputMode="decimal"
              value={f.maxOrderQty}
              onChange={set('maxOrderQty')}
              placeholder="No limit"
            />
          </Field>
          <Field label="Delivery time (hours)">
            <Input
              inputMode="numeric"
              value={f.deliveryTimeHours}
              onChange={set('deliveryTimeHours')}
            />
          </Field>
          <Field label="Stock (packs)">
            <Input inputMode="decimal" value={f.stockQty} onChange={set('stockQty')} />
          </Field>
          <Field label="Low-stock alert at (packs)">
            <Input
              inputMode="decimal"
              value={f.lowStockThreshold}
              onChange={set('lowStockThreshold')}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea rows={3} value={f.description} onChange={set('description')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              {p ? 'Save changes' : 'List product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type TierRow = { minQty: string; maxQty: string; unitPrice: string; segment: BuyerSegment };

/** Bulk pricing: price per pack falls as quantity rises; optionally per buyer segment. */
function TiersDialog({ product: p, onClose }: { product: SellerProduct; onClose: () => void }) {
  const [rows, setRows] = React.useState<TierRow[]>(() =>
    p.priceTiers.length
      ? p.priceTiers.map((t: PriceTier) => ({
          minQty: String(Number(t.minQty)),
          maxQty: t.maxQty === null ? '' : String(Number(t.maxQty)),
          unitPrice: String(Number(t.unitPrice)),
          segment: t.segment,
        }))
      : [
          {
            minQty: String(Math.max(10, Number(p.moq) * 5)),
            maxQty: '',
            unitPrice: (Number(p.price) * 0.95).toFixed(2),
            segment: 'ALL',
          },
        ],
  );
  const update = (i: number, k: keyof TierRow, v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = useApiMutation(
    () =>
      api.put(`seller/products/${p.id}/price-tiers`, {
        tiers: rows.map((r) => ({
          minQty: Number(r.minQty),
          maxQty: r.maxQty ? Number(r.maxQty) : undefined,
          unitPrice: Number(r.unitPrice),
          segment: r.segment,
        })),
      }),
    { invalidate: ['seller/products'], success: 'Bulk pricing saved', onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk pricing: {p.name}</DialogTitle>
          <DialogDescription>
            Base price {formatMoney(p.price)} per {packLabel(p)} pack. Tier prices must be at or
            below the base price.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <div className="grid grid-cols-[1fr_1fr_1fr_1.3fr_auto] gap-2 text-xs font-medium text-muted-foreground">
            <span>From (packs)</span>
            <span>To (packs)</span>
            <span>Price / pack (₹)</span>
            <span>Buyers</span>
            <span className="sr-only">Remove</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1.3fr_auto] items-center gap-2">
              <Input
                aria-label={`Tier ${i + 1} from`}
                inputMode="decimal"
                value={r.minQty}
                onChange={(e) => update(i, 'minQty', e.target.value)}
                required
              />
              <Input
                aria-label={`Tier ${i + 1} to`}
                inputMode="decimal"
                value={r.maxQty}
                onChange={(e) => update(i, 'maxQty', e.target.value)}
                placeholder="and up"
              />
              <Input
                aria-label={`Tier ${i + 1} price`}
                inputMode="decimal"
                value={r.unitPrice}
                onChange={(e) => update(i, 'unitPrice', e.target.value)}
                required
              />
              <Select
                aria-label={`Tier ${i + 1} buyers`}
                value={r.segment}
                onChange={(e) => update(i, 'segment', e.target.value)}
              >
                {BUYER_SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'ALL' ? 'Everyone' : humanize(s)}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                aria-label={`Remove tier ${i + 1}`}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setRows([...rows, { minQty: '', maxQty: '', unitPrice: '', segment: 'ALL' }])
              }
              disabled={rows.length >= 20}
            >
              <Plus /> Add tier
            </Button>
          </div>
          <DialogFooter>
            <Button type="submit" loading={save.isPending}>
              Save pricing
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
