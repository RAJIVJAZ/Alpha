'use client';

import * as React from 'react';
import { CheckCircle2, MapPin, PackageCheck, Phone, Send, Truck, XCircle } from 'lucide-react';
import { Button } from '../components/button';
import { DataTable, type Column } from '../components/data-table';
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SheetContent } from '../components/dialog';
import { Field, Input, Textarea } from '../components/form';
import { PageHeader } from '../components/layout';
import { Tabs, TabsList, TabsTrigger } from '../components/menu';
import { StatusBadge } from '../components/status';
import { api, type Paged } from '../lib/api';
import { formatDateTime, formatMoney, formatNumber, formatRelative, humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { useOutlet } from './outlet';
import type { PurchaseOrder } from './types';

const GROUPS = {
  all: { label: 'All', statuses: undefined },
  approval: { label: 'Needs approval', statuses: ['DRAFT', 'PENDING_APPROVAL', 'REJECTED'] },
  supplier: { label: 'With supplier', statuses: ['APPROVED', 'SENT_TO_SUPPLIER', 'CONFIRMED', 'PARTIALLY_CONFIRMED'] },
  transit: { label: 'On the way', statuses: ['DISPATCHED', 'IN_TRANSIT'] },
  receive: { label: 'To receive', statuses: ['DELIVERED', 'PARTIALLY_RECEIVED'] },
  closed: { label: 'Closed', statuses: ['RECEIVED', 'CLOSED', 'CANCELLED', 'SUPPLIER_REJECTED'] },
} as const;
type Group = keyof typeof GROUPS;

const RECEIVABLE = ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_RECEIVED'];
const CANCELLABLE = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT_TO_SUPPLIER', 'CONFIRMED', 'PARTIALLY_CONFIRMED'];
const n = (v: string | number | null) => formatNumber(Number(v ?? 0), { decimals: true });

/** Purchase orders: owner approval, supplier confirmation, delivery tracking and goods receipt. */
export function PurchaseOrders({ initialGroup = 'all' }: { initialGroup?: Group }) {
  const { outlets } = useOutlet();
  const [group, setGroup] = React.useState<Group>(initialGroup);
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const list = useApi<Paged<PurchaseOrder>>('procurement/purchase-orders', { status: GROUPS[group].statuses ? [...GROUPS[group].statuses] : undefined, page, pageSize: 20 }, { refetchInterval: 30_000 });
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? '—';

  const columns: Column<PurchaseOrder>[] = [
    { key: 'po', header: 'PO', cell: (p) => (<div><p className="font-medium">{p.poNumber}</p><p className="text-xs text-muted-foreground">{formatRelative(p.createdAt)}</p></div>) },
    { key: 'supplier', header: 'Supplier', sortValue: (p) => p.supplierName, cell: (p) => p.supplierName },
    ...(outlets.length > 1 ? [{ key: 'outlet', header: 'Outlet', cell: (p: PurchaseOrder) => <span className="text-sm">{outletName(p.outletId)}</span> }] : []),
    { key: 'items', header: 'Items', align: 'right', cell: (p) => p.items.length },
    { key: 'total', header: 'Total', align: 'right', sortValue: (p) => Number(p.total), cell: (p) => formatMoney(p.total) },
    { key: 'source', header: 'Raised by', cell: (p) => <span className="text-sm text-muted-foreground">{p.source === 'AUTO_REORDER' ? 'Procurement engine' : humanize(p.source)}</span> },
    { key: 'eta', header: 'Expected', cell: (p) => (p.expectedDeliveryAt ? formatDateTime(p.expectedDeliveryAt) : '—') },
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <>
      <PageHeader title="Purchase orders" description="From approval to goods receipt; stock updates automatically on receipt" />
      <Tabs value={group} onValueChange={(v) => (setGroup(v as Group), setPage(1))}>
        <TabsList className="mb-4 flex-wrap">
          {(Object.keys(GROUPS) as Group[]).map((g) => (
            <TabsTrigger key={g} value={g}>
              {GROUPS[g].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(p) => p.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        onRowClick={(p) => setOpenId(p.id)}
        empty={{ title: 'No purchase orders here' }}
        pagination={list.data ? { page, totalPages: list.data.meta.totalPages, total: list.data.meta.total, onPageChange: setPage } : undefined}
      />
      <Dialog open={!!openId} onOpenChange={(o) => (!o ? setOpenId(null) : undefined)}>
        <SheetContent side="right" className="w-full max-w-xl" aria-describedby={undefined}>{openId ? <PoDetail id={openId} outletName={outletName} /> : null}</SheetContent>
      </Dialog>
    </>
  );
}

function PoDetail({ id, outletName }: { id: string; outletName: (id: string) => string }) {
  const po = useApi<PurchaseOrder>(`procurement/purchase-orders/${id}`, undefined, { refetchInterval: 20_000 });
  const [decision, setDecision] = React.useState<'approve' | 'reject' | 'cancel' | null>(null);
  const [comment, setComment] = React.useState('');
  const [receiving, setReceiving] = React.useState(false);
  const act = useApiMutation((a: 'approve' | 'reject' | 'cancel' | 'submit') => api.post<PurchaseOrder>(`procurement/purchase-orders/${id}/${a}`, a === 'submit' ? undefined : { comment: comment || undefined }), {
    invalidate: ['procurement/'],
    success: (p) => `${p.poNumber}: ${humanize(p.status).toLowerCase()}`,
    onSuccess: () => (setDecision(null), setComment('')),
  });
  const p = po.data;
  if (!p)
    return (
      <div className="h-full animate-pulse" aria-busy>
        <DialogTitle className="sr-only">Loading purchase order</DialogTitle>
      </div>
    );
  const t = p.trackingInfo;

  return (
    <div className="grid gap-5">
      <div className="pr-8">
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{p.poNumber}</DialogTitle>
          <StatusBadge status={p.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {p.supplierName} → {outletName(p.outletId)} · {humanize(p.paymentTerms)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {p.status === 'DRAFT' ? (
          <Button size="sm" onClick={() => act.mutate('submit')} loading={act.isPending}>
            <Send /> Submit
          </Button>
        ) : null}
        {p.status === 'PENDING_APPROVAL' ? (
          <>
            <Button size="sm" onClick={() => setDecision('approve')}>
              <CheckCircle2 /> Approve & send
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDecision('reject')}>
              <XCircle /> Reject
            </Button>
          </>
        ) : null}
        {RECEIVABLE.includes(p.status) ? (
          <Button size="sm" onClick={() => setReceiving(true)}>
            <PackageCheck /> Receive goods
          </Button>
        ) : null}
        {CANCELLABLE.includes(p.status) ? (
          <Button size="sm" variant="ghost" onClick={() => setDecision('cancel')}>
            Cancel PO
          </Button>
        ) : null}
      </div>

      {t && (t.vehicleNumber || t.driverName || t.eta) ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <Truck className="size-4" aria-hidden /> Delivery tracking
          </p>
          <div className="grid gap-1 text-muted-foreground">
            {t.vehicleNumber ? <span>Vehicle {t.vehicleNumber}</span> : null}
            {t.driverName ? (
              <span className="flex items-center gap-1">
                {t.driverName}
                {t.driverPhone ? (
                  <a href={`tel:${t.driverPhone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Phone className="size-3" aria-hidden /> {t.driverPhone}
                  </a>
                ) : null}
              </span>
            ) : null}
            {t.eta ? <span>ETA {formatDateTime(t.eta)}</span> : p.expectedDeliveryAt ? <span>Expected {formatDateTime(p.expectedDeliveryAt)}</span> : null}
            {t.lat && t.lng ? (
              <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`https://maps.google.com/?q=${t.lat},${t.lng}`} target="_blank" rel="noreferrer">
                <MapPin className="size-3" aria-hidden /> Last known location
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Line items</caption>
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3 font-medium">Item</th>
              <th className="py-2 pr-3 text-right font-medium">Ordered</th>
              <th className="py-2 pr-3 text-right font-medium">Confirmed</th>
              <th className="py-2 pr-3 text-right font-medium">Received</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {p.items.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <p>{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(i.unitPrice)} / {i.unit.toLowerCase()} · GST {n(i.gstRate)}%
                  </p>
                </td>
                <td className="py-2 pr-3 text-right">{n(i.quantity)}</td>
                <td className="py-2 pr-3 text-right">{i.confirmedQty === null ? '—' : n(i.confirmedQty)}</td>
                <td className="py-2 pr-3 text-right">{n(i.receivedQty)}</td>
                <td className="py-2 text-right">{formatMoney(i.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto grid w-64 grid-cols-2 gap-y-1 text-sm tabular">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="text-right">{formatMoney(p.subtotal)}</dd>
        <dt className="text-muted-foreground">GST</dt>
        <dd className="text-right">{formatMoney(p.taxTotal)}</dd>
        <dt className="text-muted-foreground">Delivery</dt>
        <dd className="text-right">{formatMoney(p.deliveryCharge)}</dd>
        <dt className="font-semibold">Total</dt>
        <dd className="text-right font-semibold">{formatMoney(p.total)}</dd>
      </dl>
      {p.notes || p.supplierNotes ? (
        <div className="grid gap-1 text-sm">
          {p.notes ? <p><span className="text-muted-foreground">Note: </span>{p.notes}</p> : null}
          {p.supplierNotes ? <p><span className="text-muted-foreground">Supplier: </span>{p.supplierNotes}</p> : null}
        </div>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
        <ol className="relative grid gap-3 border-l pl-4">
          {(p.events ?? []).map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary" aria-hidden />
              <p className="font-medium">{humanize(e.status)}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(e.createdAt)}
                {e.note ? ` · ${e.note}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </section>
      {p.approvals?.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Approvals</h3>
          <ul className="grid gap-1 text-sm">
            {p.approvals.map((a) => (
              <li key={a.id}>
                <StatusBadge status={a.decision} /> <span className="text-muted-foreground">{formatDateTime(a.decidedAt)}</span> {a.comment ? `· ${a.comment}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConfirmDialog
        open={!!decision}
        onOpenChange={(o) => (!o ? setDecision(null) : undefined)}
        title={decision === 'approve' ? `Approve ${p.poNumber}?` : decision === 'reject' ? `Reject ${p.poNumber}?` : `Cancel ${p.poNumber}?`}
        description={decision === 'approve' ? `${formatMoney(p.total)} will be sent to ${p.supplierName} for confirmation.` : decision === 'cancel' ? 'The supplier is notified if they already have it.' : 'The order goes back to draft for changes.'}
        confirmLabel={decision === 'approve' ? 'Approve & send' : decision === 'reject' ? 'Reject' : 'Cancel PO'}
        destructive={decision !== 'approve'}
        loading={act.isPending}
        onConfirm={() => decision && act.mutate(decision)}
      >
        <Field label="Comment (optional)">
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </ConfirmDialog>
      {receiving ? <ReceiveDialog po={p} onClose={() => setReceiving(false)} /> : null}
    </div>
  );
}

function ReceiveDialog({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const outstanding = (i: PurchaseOrder['items'][number]) => Math.max(0, Number(i.confirmedQty ?? i.quantity) - Number(i.receivedQty));
  const [qty, setQty] = React.useState<Record<string, string>>(() => Object.fromEntries(po.items.map((i) => [i.id, String(outstanding(i))])));
  const [note, setNote] = React.useState('');
  const receive = useApiMutation(
    () => api.post<PurchaseOrder>(`procurement/purchase-orders/${po.id}/receive`, { lines: po.items.map((i) => ({ itemId: i.id, receivedQty: Number(qty[i.id]) || 0 })), note: note || undefined }),
    { invalidate: ['procurement/', 'inventory/'], success: (p) => `${p.poNumber}: ${humanize(p.status).toLowerCase()} · stock updated`, onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive {po.poNumber}</DialogTitle>
          <DialogDescription>Enter packs received in good condition. Anything short stays open on the PO.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), receive.mutate())}>
          {po.items.map((i) => (
            <Field key={i.id} label={`${i.name} (${n(outstanding(i))} ${i.unit.toLowerCase()} outstanding)`}>
              <Input inputMode="decimal" value={qty[i.id] ?? ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />
            </Field>
          ))}
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 1 bag torn, returned" />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={receive.isPending}>
              <PackageCheck /> Record receipt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
