'use client';

import * as React from 'react';
import {
  Banknote,
  CreditCard,
  Minus,
  Plus,
  Printer,
  QrCode,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { CategoryBarChart } from '../charts';
import { Button } from '../components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Select } from '../components/form';
import { EmptyState, PageHeader, StatGrid } from '../components/layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/menu';
import { StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import { api, newIdempotencyKey } from '../lib/api';
import {
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatRelative,
  humanize,
  istDate,
} from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { cn } from '../lib/utils';
import { useCanSeeSales } from './access';
import { OutletPicker, useOutlet } from './outlet';
import type { MerchantOrder } from './types';

interface PosMenuItem {
  id: string;
  name: string;
  price: string;
  isVeg: boolean;
  isAvailable: boolean;
  variants: {
    id: string;
    name: string;
    priceDelta: string;
    isDefault: boolean;
    isAvailable: boolean;
  }[];
  addonGroups: {
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    addons: { id: string; name: string; price: string; isAvailable: boolean }[];
  }[];
}
interface PosCategory {
  id: string;
  name: string;
  isActive: boolean;
  items: PosMenuItem[];
}
interface CartLine {
  key: string;
  item: PosMenuItem;
  variantId?: string;
  addonIds: string[];
  quantity: number;
  unitPrice: number;
  label: string;
}
interface Receipt {
  orderNumber: string;
  outlet: { name: string; address: string; gstin: string | null; fssai: string | null };
  items: { name: string; qty: number; rate: string; amount: string }[];
  subtotal: string;
  discount: string;
  packaging: string;
  cgst: string;
  sgst: string;
  roundOff: string;
  total: string;
  paymentMethod: string;
  issuedAt: string;
}
/** GET pos/summary (needs reports:read): every amount is a rupee string, splits are sales not counts. */
interface PosSummary {
  date: string;
  orders: number;
  cancelled: number;
  grossSales: string;
  taxCollected: string;
  discounts: string;
  averageTicket: string;
  byPaymentMethod: Record<string, string>;
  byChannel: Record<string, string>;
  hourly: { hour: number; orders: number; sales: string }[];
  topItems: { name: string; quantity: number; sales: string }[];
}

const PAYMENT = [
  { value: 'UPI', label: 'UPI', icon: QrCode },
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'CARD', label: 'Card', icon: CreditCard },
] as const;

/** Counter billing for food carts and quick-service outlets; built for a phone or a small tablet. */
export function PointOfSale() {
  const { outletId } = useOutlet();
  // the day's revenue is for roles with reports:read; cashiers bill without seeing it
  const canSeeSales = useCanSeeSales();
  return (
    <>
      <PageHeader
        title="Point of sale"
        description="Bill counter and table orders; tickets go straight to the kitchen"
        actions={<OutletPicker />}
      />
      <Tabs defaultValue="bill">
        <TabsList>
          <TabsTrigger value="bill">New bill</TabsTrigger>
          <TabsTrigger value="open">Open orders</TabsTrigger>
          {canSeeSales ? <TabsTrigger value="today">Today</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="bill">{outletId ? <Biller outletId={outletId} /> : null}</TabsContent>
        <TabsContent value="open">
          {outletId ? <OpenOrders outletId={outletId} /> : null}
        </TabsContent>
        {canSeeSales ? (
          <TabsContent value="today">
            {outletId ? <DailySales outletId={outletId} /> : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
}

function Biller({ outletId }: { outletId: string }) {
  const menu = useApi<PosCategory[]>(`merchant/outlets/${outletId}/menu`);
  const tables = useApi<{ id: string; label: string; isActive: boolean }[]>(
    `merchant/outlets/${outletId}/tables`,
  );
  const categories = (menu.data ?? []).filter(
    (c) => c.isActive && c.items.some((i) => i.isAvailable),
  );
  const [category, setCategory] = React.useState<string | null>(null);
  const [q, setQ] = React.useState('');
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [picking, setPicking] = React.useState<PosMenuItem | null>(null);
  const [orderType, setOrderType] = React.useState<'TAKEAWAY' | 'DINE_IN'>('TAKEAWAY');
  const [tableId, setTableId] = React.useState('');
  const [payment, setPayment] = React.useState<'UPI' | 'CASH' | 'CARD'>('UPI');
  const [customer, setCustomer] = React.useState({ name: '', phone: '' });
  const [discount, setDiscount] = React.useState('');
  const [receipt, setReceipt] = React.useState<Receipt | null>(null);
  const idem = React.useRef(newIdempotencyKey());
  React.useEffect(() => setCart([]), [outletId]);

  const activeCat = category ?? categories[0]?.id ?? null;
  const items = q.trim()
    ? categories
        .flatMap((c) => c.items)
        .filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))
    : (categories.find((c) => c.id === activeCat)?.items ?? []);
  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  const add = (item: PosMenuItem, variantId?: string, addonIds: string[] = []) => {
    const key = [item.id, variantId ?? '', ...[...addonIds].sort()].join('|');
    const variant = item.variants.find((v) => v.id === variantId);
    const addons = item.addonGroups.flatMap((g) => g.addons).filter((a) => addonIds.includes(a.id));
    const unitPrice =
      Number(item.price) +
      Number(variant?.priceDelta ?? 0) +
      addons.reduce((s, a) => s + Number(a.price), 0);
    const label = [item.name, variant?.name, ...addons.map((a) => a.name)]
      .filter(Boolean)
      .join(' · ');
    setCart((c) =>
      c.some((l) => l.key === key)
        ? c.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l))
        : [...c, { key, item, variantId, addonIds, quantity: 1, unitPrice, label }],
    );
  };
  const tap = (item: PosMenuItem) =>
    item.variants.length || item.addonGroups.length ? setPicking(item) : add(item);
  const bump = (key: string, delta: number) =>
    setCart((c) =>
      c.flatMap((l) =>
        l.key !== key
          ? [l]
          : l.quantity + delta <= 0
            ? []
            : [{ ...l, quantity: Math.min(99, l.quantity + delta) }],
      ),
    );

  const charge = useApiMutation(
    () =>
      api.post<{ order: { id: string }; receipt: Receipt }>(
        'pos/orders',
        {
          outletId,
          items: cart.map((l) => ({
            menuItemId: l.item.id,
            quantity: l.quantity,
            variantId: l.variantId,
            addonIds: l.addonIds.length ? l.addonIds : undefined,
          })),
          paymentMethod: payment,
          orderType,
          tableId: orderType === 'DINE_IN' && tableId ? tableId : undefined,
          customerName: customer.name || undefined,
          customerPhone: customer.phone || undefined,
          discount: Number(discount) || undefined,
        },
        { idempotencyKey: idem.current },
      ),
    {
      invalidate: ['pos/', 'merchant/orders', 'kds/'],
      onSuccess: (r) => {
        setReceipt(r.receipt);
        setCart([]);
        setDiscount('');
        setCustomer({ name: '', phone: '' });
        idem.current = newIdempotencyKey();
      },
    },
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0">
        <Input
          className="mb-3"
          placeholder="Search dishes"
          aria-label="Search dishes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {!q ? (
          <div
            className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1"
            role="tablist"
            aria-label="Menu categories"
          >
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c.id === activeCat}
                onClick={() => setCategory(c.id)}
                className={cn(
                  'shrink-0 rounded-full border px-4 py-2 text-sm font-medium',
                  c.id === activeCat
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-muted',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((i) => (
            <button
              key={i.id}
              type="button"
              disabled={!i.isAvailable}
              onClick={() => tap(i)}
              className="flex min-h-24 flex-col justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary active:scale-[0.98] disabled:opacity-40"
            >
              <span className="flex items-start gap-1.5 text-sm font-medium leading-snug">
                <span
                  className={cn(
                    'mt-1 size-2.5 shrink-0 rounded-sm border',
                    i.isVeg ? 'border-green-700 bg-green-600' : 'border-red-800 bg-red-700',
                  )}
                  aria-label={i.isVeg ? 'Veg' : 'Non-veg'}
                />
                {i.name}
              </span>
              <span className="text-sm tabular text-muted-foreground">
                {formatMoney(i.price, { whole: true })}
                {i.variants.length || i.addonGroups.length ? ' +' : ''}
              </span>
            </button>
          ))}
        </div>
        {menu.data && !items.length ? (
          <EmptyState
            title="No dishes"
            description="Nothing available in this category right now."
          />
        ) : null}
      </div>

      <Card className="self-start lg:sticky lg:top-20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="size-4" aria-hidden /> Bill{' '}
            {count ? `· ${count} item${count > 1 ? 's' : ''}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {cart.length ? (
            <ul className="divide-y text-sm">
              {cart.map((l) => (
                <li key={l.key} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{l.label}</span>
                    <span className="text-xs tabular text-muted-foreground">
                      {formatMoney(l.unitPrice * l.quantity)}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8"
                    onClick={() => bump(l.key, -1)}
                    aria-label={`One less ${l.label}`}
                  >
                    {l.quantity === 1 ? <Trash2 /> : <Minus />}
                  </Button>
                  <span className="w-6 text-center tabular">{l.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8"
                    onClick={() => bump(l.key, 1)}
                    aria-label={`One more ${l.label}`}
                  >
                    <Plus />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Tap dishes to add them.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Order type">
            {(['TAKEAWAY', 'DINE_IN'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={orderType === t}
                onClick={() => setOrderType(t)}
                className={cn(
                  'rounded-md border py-2 text-sm font-medium',
                  orderType === t
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'hover:bg-muted',
                )}
              >
                {humanize(t)}
              </button>
            ))}
          </div>
          {orderType === 'DINE_IN' && tables.data?.length ? (
            <Select aria-label="Table" value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">No table</option>
              {tables.data
                .filter((t) => t.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.label}
                  </option>
                ))}
            </Select>
          ) : null}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Customer & discount</summary>
            <div className="mt-2 grid gap-2">
              <Input
                placeholder="Name"
                aria-label="Customer name"
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              />
              <Input
                placeholder="Phone"
                aria-label="Customer phone"
                inputMode="tel"
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              />
              <Input
                placeholder="Discount (₹)"
                aria-label="Discount in rupees"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </details>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
            {PAYMENT.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={payment === value}
                onClick={() => setPayment(value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border py-2 text-xs font-medium',
                  payment === value
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">
              Subtotal{Number(discount) ? ' after discount' : ''}
            </span>
            <span className="text-lg font-semibold tabular">
              {formatMoney(Math.max(0, subtotal - (Number(discount) || 0)))}
            </span>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">GST is added on the receipt.</p>
          <Button
            size="lg"
            disabled={!cart.length}
            loading={charge.isPending}
            onClick={() => charge.mutate()}
          >
            Charge · {humanize(payment)}
          </Button>
        </CardContent>
      </Card>

      <OptionsDialog
        item={picking}
        onClose={() => setPicking(null)}
        onAdd={(v, a) => (add(picking!, v, a), setPicking(null))}
      />
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function OptionsDialog({
  item,
  onClose,
  onAdd,
}: {
  item: PosMenuItem | null;
  onClose: () => void;
  onAdd: (variantId: string | undefined, addonIds: string[]) => void;
}) {
  const [variant, setVariant] = React.useState<string | undefined>();
  const [addons, setAddons] = React.useState<string[]>([]);
  React.useEffect(() => {
    setVariant(item?.variants.find((v) => v.isDefault)?.id ?? item?.variants[0]?.id);
    setAddons([]);
  }, [item]);
  if (!item) return null;
  const groupOk = item.addonGroups.every((g) => {
    const n = g.addons.filter((a) => addons.includes(a.id)).length;
    return n >= g.minSelect && n <= g.maxSelect;
  });
  const toggle = (groupMax: number, groupIds: string[], id: string) =>
    setAddons((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      const inGroup = cur.filter((x) => groupIds.includes(x));
      // single-choice groups swap the selection; multi-choice stop at the max
      if (groupMax === 1) return [...cur.filter((x) => !groupIds.includes(x)), id];
      return inGroup.length >= groupMax ? cur : [...cur, id];
    });
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>Choose options</DialogDescription>
        </DialogHeader>
        {item.variants.length ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Size</legend>
            {item.variants
              .filter((v) => v.isAvailable)
              .map((v) => (
                <label
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="variant"
                      checked={variant === v.id}
                      onChange={() => setVariant(v.id)}
                      className="accent-[var(--primary)]"
                    />
                    {v.name}
                  </span>
                  <span className="tabular text-muted-foreground">
                    {formatMoney(Number(item.price) + Number(v.priceDelta), { whole: true })}
                  </span>
                </label>
              ))}
          </fieldset>
        ) : null}
        {item.addonGroups.map((g) => (
          <fieldset key={g.id} className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">
              {g.name}{' '}
              <span className="font-normal text-muted-foreground">
                (
                {g.minSelect
                  ? `pick ${g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}–${g.maxSelect}`}`
                  : `up to ${g.maxSelect}`}
                )
              </span>
            </legend>
            {g.addons
              .filter((a) => a.isAvailable)
              .map((a) => (
                <label
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={addons.includes(a.id)}
                      onChange={() =>
                        toggle(
                          g.maxSelect,
                          g.addons.map((x) => x.id),
                          a.id,
                        )
                      }
                      className="accent-[var(--primary)]"
                    />
                    {a.name}
                  </span>
                  <span className="tabular text-muted-foreground">
                    +{formatMoney(a.price, { whole: true })}
                  </span>
                </label>
              ))}
          </fieldset>
        ))}
        <DialogFooter>
          <Button disabled={!groupOk} onClick={() => onAdd(variant, addons)}>
            Add to bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDialog({ receipt: r, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  if (!r) return null;
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-sm print:shadow-none">
        <DialogHeader>
          <DialogTitle>Paid · {r.orderNumber}</DialogTitle>
          <DialogDescription>Ticket sent to the kitchen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 font-mono text-xs" id="fg-receipt">
          <div className="text-center">
            <p className="font-semibold">{r.outlet.name}</p>
            <p>{r.outlet.address}</p>
            {r.outlet.gstin ? <p>GSTIN {r.outlet.gstin}</p> : null}
            {r.outlet.fssai ? <p>FSSAI {r.outlet.fssai}</p> : null}
            <p>{formatDateTime(r.issuedAt)}</p>
          </div>
          <table className="w-full">
            <tbody>
              {r.items.map((i, idx) => (
                <tr key={idx}>
                  <td className="pr-2">
                    {i.qty} × {i.name}
                  </td>
                  <td className="text-right">{Number(i.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="grid grid-cols-2 border-t pt-1">
            <dt>Subtotal</dt>
            <dd className="text-right">{Number(r.subtotal).toFixed(2)}</dd>
            {Number(r.discount) ? (
              <>
                <dt>Discount</dt>
                <dd className="text-right">-{Number(r.discount).toFixed(2)}</dd>
              </>
            ) : null}
            {Number(r.packaging) ? (
              <>
                <dt>Packaging</dt>
                <dd className="text-right">{Number(r.packaging).toFixed(2)}</dd>
              </>
            ) : null}
            <dt>CGST</dt>
            <dd className="text-right">{Number(r.cgst).toFixed(2)}</dd>
            <dt>SGST</dt>
            <dd className="text-right">{Number(r.sgst).toFixed(2)}</dd>
            {Number(r.roundOff) ? (
              <>
                <dt>Round off</dt>
                <dd className="text-right">{Number(r.roundOff).toFixed(2)}</dd>
              </>
            ) : null}
            <dt className="font-semibold">Total ({humanize(r.paymentMethod)})</dt>
            <dd className="text-right font-semibold">₹{Number(r.total).toFixed(2)}</dd>
          </dl>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button onClick={onClose}>Next bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpenOrders({ outletId }: { outletId: string }) {
  const list = useApi<{ data: MerchantOrder[] }>(
    'merchant/orders',
    { outletId, status: ['ACCEPTED', 'PREPARING', 'READY'], pageSize: 50 },
    { refetchInterval: 10_000 },
  );
  const done = useApiMutation((id: string) => api.post(`pos/orders/${id}/complete`), {
    invalidate: ['merchant/orders', 'pos/', 'kds/'],
    success: 'Order handed over',
  });
  const rows = (list.data?.data ?? []).filter((o) => o.channel === 'POS' || o.channel === 'QR');
  if (!rows.length)
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title={list.isLoading ? 'Loading…' : 'No open counter orders'}
        description="Counter and QR orders waiting to be handed over appear here."
      />
    );
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((o) => (
        <Card key={o.id}>
          <CardContent className="grid gap-2 pt-5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{o.orderNumber}</span>
              <StatusBadge status={o.status} />
            </div>
            <p className="text-muted-foreground">
              {humanize(o.channel)} · {humanize(o.type)} · {o.customerName ?? 'Walk-in'} ·{' '}
              {formatRelative(o.placedAt ?? o.createdAt)}
            </p>
            <p className="tabular">{formatMoney(o.total)}</p>
            <Button
              size="sm"
              onClick={() => done.mutate(o.id)}
              loading={done.isPending && done.variables === o.id}
            >
              Hand over
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DailySales({ outletId }: { outletId: string }) {
  const [date, setDate] = React.useState(() => istDate(0));
  const s = useApi<PosSummary>('pos/summary', { outletId, date }).data;
  const hourly = (s?.hourly ?? [])
    .filter((h) => h.hour >= 6)
    .map((h) => ({ hour: `${String(h.hour).padStart(2, '0')}:00`, sales: Number(h.sales) }));
  return (
    <div className="grid gap-4">
      <Field label="Business day" className="w-48">
        <Input
          type="date"
          value={date}
          max={istDate(0)}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <StatGrid>
        <StatTile label="Sales" value={s ? formatMoneyCompact(s.grossSales) : '—'} />
        <StatTile label="Orders" value={s ? formatNumber(s.orders) : '—'} />
        <StatTile
          label="Average ticket"
          value={s ? formatMoney(s.averageTicket, { whole: true }) : '—'}
        />
        <StatTile
          label="GST collected"
          value={s ? formatMoney(s.taxCollected, { whole: true }) : '—'}
        />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryBarChart
          title="Sales by hour"
          data={hourly}
          categoryKey="hour"
          categoryLabel="Hour"
          series={[{ key: 'sales', label: 'Sales' }]}
          valueFormat={formatMoneyCompact}
        />
        <Card>
          <CardHeader>
            <CardTitle>Top dishes</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="divide-y text-sm">
              {(s?.topItems ?? []).map((t, i) => (
                <li key={t.name} className="flex justify-between gap-3 py-1.5">
                  <span>
                    <span className="mr-2 text-muted-foreground tabular">{i + 1}.</span>
                    {t.name}
                  </span>
                  <span className="tabular text-muted-foreground">
                    {t.quantity} · {formatMoney(t.sales, { whole: true })}
                  </span>
                </li>
              ))}
            </ol>
            {s ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Payments:{' '}
                {Object.entries(s.byPaymentMethod)
                  .map(([k, v]) => `${humanize(k)} ${formatMoney(v, { whole: true })}`)
                  .join(' · ') || 'none'}
                {s.cancelled ? ` · ${s.cancelled} cancelled` : ''}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
