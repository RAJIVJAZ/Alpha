'use client';

import * as React from 'react';
import { Star, XCircle } from 'lucide-react';
import { Badge } from '../components/badge';
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
import { Field, Select, Textarea } from '../components/form';
import { Tabs, TabsList, TabsTrigger } from '../components/menu';
import { StatusBadge } from '../components/status';
import { api, type Paged } from '../lib/api';
import { formatDate, formatDateTime, formatMoney, formatRelative, humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { useCan } from '../merchant/access';
import { OrderSummary } from '../seller/orders';
import type { SellerOrder } from '../seller/types';

type BuyerOrder = SellerOrder & { rating: number | null };

const GROUPS = {
  open: {
    label: 'Open',
    statuses: ['PLACED', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'PACKED', 'DISPATCHED', 'IN_TRANSIT'],
  },
  done: { label: 'Delivered', statuses: ['DELIVERED'] },
  closed: { label: 'Rejected / cancelled', statuses: ['REJECTED', 'CANCELLED'] },
  all: { label: 'All', statuses: [] as string[] },
} as const;
type Group = keyof typeof GROUPS;

/** The service lets buyers cancel until dispatch. */
const CANCELLABLE = ['PLACED', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'PACKED'];
const ORDERS = 'marketplace/orders';

/** Orders the business placed on the marketplace (and ones its purchase orders became). */
export function BuyerOrders() {
  const canManage = useCan('procurement:manage');
  const [group, setGroup] = React.useState<Group>('open');
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<BuyerOrder | null>(null);
  const [rating, setRating] = React.useState<BuyerOrder | null>(null);
  const list = useApi<Paged<BuyerOrder> & { statusCounts: Record<string, number> }>(
    ORDERS,
    {
      status: GROUPS[group].statuses.length ? [...GROUPS[group].statuses] : undefined,
      page,
      pageSize: 20,
    },
    { refetchInterval: 30_000 },
  );
  const counts = list.data?.statusCounts ?? {};
  const openCount = GROUPS.open.statuses.reduce((s, st) => s + (counts[st] ?? 0), 0);

  const columns: Column<BuyerOrder>[] = [
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
      key: 'seller',
      header: 'Seller',
      sortValue: (o) => o.sellerName,
      cell: (o) => (
        <div>
          <p>{o.sellerName}</p>
          {o.sourcePurchaseOrderId ? <Badge variant="info">Purchase order</Badge> : null}
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
      key: 'deliver',
      header: 'Delivery',
      cell: (o) =>
        o.deliveryDate
          ? formatDate(o.deliveryDate)
          : o.expectedDeliveryAt
            ? formatDateTime(o.expectedDeliveryAt)
            : '—',
    },
    { key: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
    {
      key: 'rating',
      header: 'Rating',
      cell: (o) =>
        o.rating ? (
          <span className="inline-flex items-center gap-1 text-sm">
            <Star className="size-3" aria-hidden /> {o.rating}
            <span className="sr-only">out of 5</span>
          </span>
        ) : o.status === 'DELIVERED' && canManage ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => (e.stopPropagation(), setRating(o))}
            onKeyDown={(e) => e.stopPropagation()}
          >
            Rate
          </Button>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <>
      <Tabs value={group} onValueChange={(v) => (setGroup(v as Group), setPage(1))}>
        <TabsList className="mb-3 flex-wrap">
          {(Object.keys(GROUPS) as Group[]).map((g) => (
            <TabsTrigger key={g} value={g}>
              {GROUPS[g].label}
              {g === 'open' && openCount ? ` (${openCount})` : ''}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(o) => o.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        onRowClick={setOpen}
        empty={{ title: 'No orders here', description: 'Orders you place show up here.' }}
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
      <Dialog open={!!open} onOpenChange={(o) => (!o ? setOpen(null) : undefined)}>
        <SheetContent side="right" className="w-full max-w-xl" aria-describedby={undefined}>
          {open ? (
            <OrderDetail
              id={open.id}
              canManage={canManage}
              onRate={() => (setRating(open), setOpen(null))}
              rated={!!open.rating}
            />
          ) : null}
        </SheetContent>
      </Dialog>
      {rating ? <RateDialog order={rating} onClose={() => setRating(null)} /> : null}
    </>
  );
}

function OrderDetail({
  id,
  canManage,
  rated,
  onRate,
}: {
  id: string;
  canManage: boolean;
  rated: boolean;
  onRate: () => void;
}) {
  const order = useApi<SellerOrder>(`${ORDERS}/${id}`);
  const [cancelling, setCancelling] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const cancel = useApiMutation(
    () =>
      api.post<SellerOrder>(`${ORDERS}/${id}/cancel`, {
        reason: reason.trim() || 'Cancelled by buyer',
      }),
    {
      invalidate: [ORDERS, 'marketplace/products'],
      success: (o) => `${o.orderNumber} cancelled`,
      onSuccess: () => setCancelling(false),
    },
  );
  const o = order.data;
  if (!o) return <DialogTitle className="sr-only">Loading order</DialogTitle>;
  // a purchase order's sales order is cancelled from the purchase order, which keeps both in step
  const canCancel = canManage && CANCELLABLE.includes(o.status) && !o.sourcePurchaseOrderId;

  return (
    <div className="grid gap-5">
      <div className="pr-8">
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{o.orderNumber}</DialogTitle>
          <StatusBadge status={o.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {o.sellerName} · {humanize(o.paymentTerms)} · {humanize(o.paymentStatus)}
          {o.deliveryDate ? ` · delivery ${formatDate(o.deliveryDate)}` : ''}
        </p>
      </div>
      {canCancel || (o.status === 'DELIVERED' && canManage && !rated) ? (
        <div className="flex flex-wrap gap-2">
          {canCancel ? (
            <Button size="sm" variant="outline" onClick={() => setCancelling(true)}>
              <XCircle /> Cancel order
            </Button>
          ) : null}
          {o.status === 'DELIVERED' && canManage && !rated ? (
            <Button size="sm" onClick={onRate}>
              <Star /> Rate {o.sellerName}
            </Button>
          ) : null}
        </div>
      ) : null}
      {o.sourcePurchaseOrderId && CANCELLABLE.includes(o.status) ? (
        <p className="text-sm text-muted-foreground">
          Raised from a purchase order: cancel it from Purchase orders.
        </p>
      ) : null}
      <OrderSummary order={o} />
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Cancel ${o.orderNumber}?`}
        description={`${o.sellerName} is told right away; any stock they reserved goes back on sale.`}
        confirmLabel="Cancel order"
        destructive
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      >
        <Field label="Reason (optional)">
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

const SCORES = [5, 4, 3, 2, 1];

function RateDialog({ order, onClose }: { order: SellerOrder; onClose: () => void }) {
  const [rating, setRating] = React.useState('5');
  const [quality, setQuality] = React.useState('');
  const [onTime, setOnTime] = React.useState('');
  const [comment, setComment] = React.useState('');
  const save = useApiMutation(
    () =>
      api.post(`${ORDERS}/${order.id}/rating`, {
        rating: Number(rating),
        qualityRating: quality ? Number(quality) : undefined,
        onTime: onTime ? onTime === 'yes' : undefined,
        comment: comment.trim() || undefined,
      }),
    { invalidate: [ORDERS], success: 'Thanks, your rating is in', onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate {order.sellerName}</DialogTitle>
          <DialogDescription>
            For {order.orderNumber}. Ratings help every buyer pick reliable sellers.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), save.mutate())}
        >
          <Field label="Overall">
            <Select value={rating} onChange={(e) => setRating(e.target.value)}>
              {SCORES.map((s) => (
                <option key={s} value={s}>
                  {'★'.repeat(s)} ({s})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Product quality">
            <Select value={quality} onChange={(e) => setQuality(e.target.value)}>
              <option value="">Skip</option>
              {SCORES.map((s) => (
                <option key={s} value={s}>
                  {'★'.repeat(s)} ({s})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Arrived on time?" hint="Skip to use the delivery record">
            <Select value={onTime} onChange={(e) => setOnTime(e.target.value)}>
              <option value="">Skip</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Comment" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Submit rating
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
