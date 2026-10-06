'use client';

import * as React from 'react';
import {
  CheckCircle2,
  LocateFixed,
  MapPin,
  PackageCheck,
  Phone,
  Search,
  Truck,
  XCircle,
} from 'lucide-react';
import { Button } from '../components/button';
import { DataTable, type Column } from '../components/data-table';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SheetContent,
} from '../components/dialog';
import { Field, Input, Textarea } from '../components/form';
import { FilterBar, PageHeader } from '../components/layout';
import { Tabs, TabsList, TabsTrigger } from '../components/menu';
import { StatusBadge } from '../components/status';
import { Badge } from '../components/badge';
import { api, type Paged } from '../lib/api';
import { formatDateTime, formatMoney, formatNumber, formatRelative, humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import type { SellerOrder } from './types';

const GROUPS = {
  new: { label: 'To confirm', statuses: ['PLACED'] },
  pack: { label: 'To pack', statuses: ['CONFIRMED', 'PARTIALLY_CONFIRMED'] },
  ship: { label: 'Ready to ship', statuses: ['PACKED'] },
  transit: { label: 'On the way', statuses: ['DISPATCHED', 'IN_TRANSIT'] },
  done: { label: 'Delivered', statuses: ['DELIVERED'] },
  closed: { label: 'Rejected / cancelled', statuses: ['REJECTED', 'CANCELLED'] },
  all: { label: 'All', statuses: [] as string[] },
} as const;
type Group = keyof typeof GROUPS;
const n = (v: string | number | null) => formatNumber(Number(v ?? 0), { decimals: true });

/** Incoming B2B orders (including purchase orders raised by restaurants' procurement engines) through to delivery. */
export function SellerOrders() {
  const [group, setGroup] = React.useState<Group>('new');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const list = useApi<Paged<SellerOrder> & { statusCounts: Record<string, number> }>(
    'seller/orders',
    {
      status: GROUPS[group].statuses.length ? [...GROUPS[group].statuses] : undefined,
      q: q || undefined,
      page,
      pageSize: 20,
    },
    { refetchInterval: 20_000 },
  );
  const counts = list.data?.statusCounts ?? {};
  const countOf = (g: Group) => GROUPS[g].statuses.reduce((s, st) => s + (counts[st] ?? 0), 0);

  const columns: Column<SellerOrder>[] = [
    {
      key: 'no',
      header: 'Order',
      cell: (o) => (
        <div>
          <p className="font-medium">{o.orderNumber}</p>
          <p className="text-xs text-muted-foreground">{formatRelative(o.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'buyer',
      header: 'Buyer',
      sortValue: (o) => o.buyerName,
      cell: (o) => (
        <div>
          <p>{o.buyerName}</p>
          {o.sourcePurchaseOrderId ? <Badge variant="info">Auto PO</Badge> : null}
        </div>
      ),
    },
    { key: 'items', header: 'Items', align: 'right', cell: (o) => o.items.length },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (o) => Number(o.total),
      cell: (o) => formatMoney(o.total),
    },
    {
      key: 'terms',
      header: 'Terms',
      cell: (o) => <span className="text-sm">{humanize(o.paymentTerms)}</span>,
    },
    {
      key: 'deliver',
      header: 'Deliver by',
      cell: (o) =>
        o.expectedDeliveryAt
          ? formatDateTime(o.expectedDeliveryAt)
          : o.deliveryDate
            ? formatDateTime(o.deliveryDate)
            : '—',
    },
    { key: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        description="Confirm, pack, dispatch and deliver; confirmation reserves stock"
      />
      <Tabs value={group} onValueChange={(v) => (setGroup(v as Group), setPage(1))}>
        <TabsList className="mb-3 flex-wrap">
          {(Object.keys(GROUPS) as Group[]).map((g) => (
            <TabsTrigger key={g} value={g}>
              {GROUPS[g].label}
              {g !== 'all' && g !== 'done' && g !== 'closed' && countOf(g)
                ? ` (${countOf(g)})`
                : ''}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <FilterBar>
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search by order number</span>
          <Input
            className="w-56 pl-8"
            placeholder="Order number"
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(1))}
          />
        </label>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(o) => o.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        onRowClick={(o) => setOpenId(o.id)}
        empty={{ title: 'Nothing here right now' }}
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
        <SheetContent side="right" className="w-full max-w-xl" aria-describedby={undefined}>
          {openId ? <OrderDetail id={openId} /> : null}
        </SheetContent>
      </Dialog>
    </>
  );
}

function OrderDetail({ id }: { id: string }) {
  const order = useApi<SellerOrder>(`seller/orders/${id}`);
  const [dialog, setDialog] = React.useState<'confirm' | 'reject' | 'dispatch' | 'deliver' | null>(
    null,
  );
  const act = useApiMutation(
    (v: { action: string; body?: unknown }) =>
      api.post<SellerOrder>(`seller/orders/${id}/${v.action}`, v.body),
    {
      invalidate: ['seller/orders', 'seller/analytics', 'seller/products'],
      success: (o) => `${o.orderNumber}: ${humanize(o.status).toLowerCase()}`,
      onSuccess: () => setDialog(null),
    },
  );
  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        act.mutate({
          action: 'location',
          body: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  const o = order.data;
  if (!o) return <DialogTitle className="sr-only">Loading order</DialogTitle>;
  const a = o.deliveryAddress;
  const t = o.trackingInfo;

  return (
    <div className="grid gap-5">
      <div className="pr-8">
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{o.orderNumber}</DialogTitle>
          <StatusBadge status={o.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {o.buyerName} · {humanize(o.paymentTerms)} · {humanize(o.paymentStatus)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {o.status === 'PLACED' ? (
          <>
            <Button size="sm" onClick={() => setDialog('confirm')}>
              <CheckCircle2 /> Confirm
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('reject')}>
              <XCircle /> Reject
            </Button>
          </>
        ) : null}
        {o.status === 'CONFIRMED' || o.status === 'PARTIALLY_CONFIRMED' ? (
          <Button size="sm" onClick={() => act.mutate({ action: 'pack' })} loading={act.isPending}>
            <PackageCheck /> Mark packed
          </Button>
        ) : null}
        {['CONFIRMED', 'PARTIALLY_CONFIRMED', 'PACKED'].includes(o.status) ? (
          <Button
            size="sm"
            variant={o.status === 'PACKED' ? 'default' : 'outline'}
            onClick={() => setDialog('dispatch')}
          >
            <Truck /> Dispatch
          </Button>
        ) : null}
        {o.status === 'DISPATCHED' || o.status === 'IN_TRANSIT' ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={locate}
              loading={act.isPending && act.variables?.action === 'location'}
            >
              <LocateFixed /> Share location
            </Button>
            <Button size="sm" onClick={() => setDialog('deliver')}>
              <CheckCircle2 /> Mark delivered
            </Button>
          </>
        ) : null}
      </div>

      {a ? (
        <div className="grid gap-0.5 text-sm">
          <p className="flex items-center gap-1 font-medium">
            <MapPin className="size-4" aria-hidden /> Deliver to
          </p>
          <p>{a.contactName}</p>
          <p className="text-muted-foreground">
            {a.line1}, {a.city} {a.pincode}
          </p>
          {a.contactPhone ? (
            <a
              href={`tel:${a.contactPhone}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Phone className="size-3" aria-hidden /> {a.contactPhone}
            </a>
          ) : null}
        </div>
      ) : null}
      {t && (t.vehicleNumber || t.driverName) ? (
        <p className="text-sm text-muted-foreground">
          <Truck className="mr-1 inline size-4" aria-hidden />
          {[t.vehicleNumber, t.driverName, t.driverPhone].filter(Boolean).join(' · ')}
          {t.eta ? ` · ETA ${formatDateTime(t.eta)}` : ''}
        </p>
      ) : null}

      <table className="w-full text-sm">
        <caption className="sr-only">Items</caption>
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-3 font-medium">Item</th>
            <th className="py-2 pr-3 text-right font-medium">Ordered</th>
            <th className="py-2 pr-3 text-right font-medium">Confirmed</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {o.items.map((i) => (
            <tr key={i.id} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <p>{i.name}</p>
                <p className="text-xs text-muted-foreground">
                  {i.sku} · {formatMoney(i.unitPrice)} / {i.unit.toLowerCase()} · GST {n(i.gstRate)}
                  %
                </p>
              </td>
              <td className="py-2 pr-3 text-right">{n(i.quantity)}</td>
              <td className="py-2 pr-3 text-right">
                {i.confirmedQty === null ? '—' : n(i.confirmedQty)}
              </td>
              <td className="py-2 text-right">{formatMoney(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto grid w-64 grid-cols-2 gap-y-1 text-sm tabular">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="text-right">{formatMoney(o.subtotal)}</dd>
        {Number(o.discount) ? (
          <>
            <dt className="text-muted-foreground">Dealer discount</dt>
            <dd className="text-right">-{formatMoney(o.discount)}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">GST</dt>
        <dd className="text-right">{formatMoney(o.taxTotal)}</dd>
        <dt className="text-muted-foreground">Delivery</dt>
        <dd className="text-right">{formatMoney(o.deliveryCharge)}</dd>
        <dt className="font-semibold">Total</dt>
        <dd className="text-right font-semibold">{formatMoney(o.total)}</dd>
      </dl>
      {o.notes ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Buyer note: </span>
          {o.notes}
        </p>
      ) : null}
      {o.rejectionReason ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Reason: </span>
          {o.rejectionReason}
        </p>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
        <ol className="relative grid gap-3 border-l pl-4">
          {(o.events ?? []).map((e) => (
            <li key={e.id} className="relative text-sm">
              <span
                className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary"
                aria-hidden
              />
              <p className="font-medium">{humanize(e.status)}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(e.createdAt)}
                {e.note ? ` · ${e.note}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {dialog === 'confirm' ? (
        <ConfirmOrderDialog
          order={o}
          loading={act.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(body) => act.mutate({ action: 'confirm', body })}
        />
      ) : null}
      {dialog === 'dispatch' ? (
        <DispatchDialog
          loading={act.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(body) => act.mutate({ action: 'dispatch', body })}
        />
      ) : null}
      <RejectDialog
        open={dialog === 'reject'}
        loading={act.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(reason) => act.mutate({ action: 'reject', body: { reason } })}
      />
      <ConfirmDialog
        open={dialog === 'deliver'}
        onOpenChange={(v) => (!v ? setDialog(null) : undefined)}
        title={`Mark ${o.orderNumber} delivered?`}
        description={`${o.buyerName} will be asked to record the goods receipt.`}
        confirmLabel="Mark delivered"
        loading={act.isPending}
        onConfirm={() => act.mutate({ action: 'deliver' })}
      />
    </div>
  );
}

function ConfirmOrderDialog({
  order,
  loading,
  onClose,
  onSubmit,
}: {
  order: SellerOrder;
  loading: boolean;
  onClose: () => void;
  onSubmit: (body: unknown) => void;
}) {
  const [qty, setQty] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(order.items.map((i) => [i.productId, String(Number(i.quantity))])),
  );
  const [eta, setEta] = React.useState('');
  const [note, setNote] = React.useState('');
  const partial = order.items.some((i) => Number(qty[i.productId]) !== Number(i.quantity));
  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm {order.orderNumber}</DialogTitle>
          <DialogDescription>
            Lower a quantity to confirm part of the order; the bill is recalculated and stock is
            reserved.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              lines: partial
                ? order.items.map((i) => ({
                    productId: i.productId,
                    confirmedQty: Number(qty[i.productId]) || 0,
                  }))
                : undefined,
              expectedDeliveryAt: eta ? new Date(eta).toISOString() : undefined,
              note: note || undefined,
            });
          }}
        >
          {order.items.map((i) => (
            <Field key={i.id} label={`${i.name} (ordered ${n(i.quantity)})`}>
              <Input
                inputMode="decimal"
                value={qty[i.productId] ?? ''}
                onChange={(e) => setQty({ ...qty, [i.productId]: e.target.value })}
              />
            </Field>
          ))}
          <Field label="Expected delivery">
            <Input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} />
          </Field>
          <Field label="Note to buyer">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={loading}>
              {partial ? 'Confirm partially' : 'Confirm order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DispatchDialog({
  loading,
  onClose,
  onSubmit,
}: {
  loading: boolean;
  onClose: () => void;
  onSubmit: (body: unknown) => void;
}) {
  const [f, setF] = React.useState({ vehicleNumber: '', driverName: '', driverPhone: '', eta: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispatch</DialogTitle>
          <DialogDescription>
            The buyer sees these details on their purchase order.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              vehicleNumber: f.vehicleNumber || undefined,
              driverName: f.driverName || undefined,
              driverPhone: f.driverPhone || undefined,
              eta: f.eta ? new Date(f.eta).toISOString() : undefined,
            });
          }}
        >
          <Field label="Vehicle number">
            <Input
              value={f.vehicleNumber}
              onChange={set('vehicleNumber')}
              placeholder="KA-01-AB-1234"
            />
          </Field>
          <Field label="Driver">
            <Input value={f.driverName} onChange={set('driverName')} />
          </Field>
          <Field label="Driver phone">
            <Input
              value={f.driverPhone}
              onChange={set('driverPhone')}
              inputMode="tel"
              placeholder="+91"
            />
          </Field>
          <Field label="ETA">
            <Input type="datetime-local" value={f.eta} onChange={set('eta')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={loading}>
              <Truck /> Dispatch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState('Out of stock');
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => (!v ? onClose() : undefined)}
      title="Reject this order?"
      description="The buyer is notified and can reorder from another supplier."
      confirmLabel="Reject order"
      destructive
      loading={loading}
      onConfirm={() => onSubmit(reason)}
    >
      <Field label="Reason">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ConfirmDialog>
  );
}
