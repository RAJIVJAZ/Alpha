'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Bike, Check, ChefHat, PackageCheck, Search, ShoppingBag, Utensils, X } from 'lucide-react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { DataTable, type Column } from '../components/data-table';
import { ConfirmDialog, SheetContent } from '../components/dialog';
import { Field, Input, Select } from '../components/form';
import { FilterBar, PageHeader } from '../components/layout';
import { Tabs, TabsList, TabsTrigger } from '../components/menu';
import { StatusBadge } from '../components/status';
import { api, type Paged } from '../lib/api';
import { formatMoney, formatRelative, formatTime, humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { OutletPicker, useOutlet } from './outlet';
import type { MerchantOrder } from './types';

const LANES = {
  new: { label: 'New', statuses: ['PLACED'] },
  kitchen: { label: 'In kitchen', statuses: ['ACCEPTED', 'PREPARING'] },
  ready: { label: 'Ready', statuses: ['READY'] },
  dispatched: { label: 'On the way', statuses: ['PICKED_UP', 'OUT_FOR_DELIVERY'] },
  done: { label: 'Completed', statuses: ['DELIVERED', 'COMPLETED'] },
  cancelled: { label: 'Cancelled', statuses: ['CANCELLED', 'REJECTED'] },
} as const;
type Lane = keyof typeof LANES;

const TYPE_ICON = { DELIVERY: Bike, TAKEAWAY: ShoppingBag, DINE_IN: Utensils } as const;

/** Live order management: lanes by status, actions that move orders through the kitchen. */
export function OrdersBoard() {
  const { outletId } = useOutlet();
  const [lane, setLane] = React.useState<Lane>('new');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const active = lane !== 'done' && lane !== 'cancelled';
  const list = useApi<Paged<MerchantOrder> & { statusCounts: Record<string, number> }>(
    outletId ? 'merchant/orders' : null,
    {
      outletId: outletId ?? undefined,
      status: [...LANES[lane].statuses],
      q: q || undefined,
      page,
      pageSize: 25,
    },
    { refetchInterval: active ? 10_000 : false },
  );
  const counts = list.data?.statusCounts ?? {};
  const laneCount = (l: Lane) => LANES[l].statuses.reduce((s, st) => s + (counts[st] ?? 0), 0);

  const columns: Column<MerchantOrder>[] = [
    {
      key: 'order',
      header: 'Order',
      cell: (o) => {
        const Icon = TYPE_ICON[o.type];
        return (
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" aria-label={humanize(o.type)} />
            <div>
              <p className="font-medium">{o.orderNumber}</p>
              <p className="text-xs text-muted-foreground">
                {humanize(o.channel)} · {formatRelative(o.placedAt ?? o.createdAt)}
              </p>
            </div>
          </div>
        );
      },
    },
    { key: 'customer', header: 'Customer', cell: (o) => o.customerName ?? '—' },
    { key: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
    {
      key: 'payment',
      header: 'Payment',
      cell: (o) => (
        <span className="text-sm">
          {humanize(o.paymentMethod)} · {humanize(o.paymentStatus)}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (o) => formatMoney(o.total),
      sortValue: (o) => Number(o.total),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (o) => <OrderActions order={o} compact />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        description="Live orders refresh every 10 seconds"
        actions={<OutletPicker />}
      />
      <FilterBar>
        <Tabs value={lane} onValueChange={(v) => (setLane(v as Lane), setPage(1))}>
          <TabsList className="h-auto flex-wrap">
            {(Object.keys(LANES) as Lane[]).map((l) => (
              <TabsTrigger key={l} value={l}>
                {LANES[l].label}
                {laneCount(l) ? (
                  <Badge variant={l === 'new' ? 'warning' : 'neutral'}>{laneCount(l)}</Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <label className="relative ml-auto">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search orders</span>
          <Input
            className="h-9 w-56 pl-8"
            placeholder="Order no. or customer"
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
        empty={{
          title: `No ${LANES[lane].label.toLowerCase()} orders`,
          description: active ? 'New orders appear here automatically.' : undefined,
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
      <OrderSheet orderId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

/** Next-step actions for an order in its current state. */
export function OrderActions({ order, compact }: { order: MerchantOrder; compact?: boolean }) {
  const [reject, setReject] = React.useState(false);
  const [reason, setReason] = React.useState('Item out of stock');
  const [prep, setPrep] = React.useState(String(order.type === 'DINE_IN' ? 15 : 20));
  const move = useApiMutation(
    (v: { action: string; body?: object }) =>
      api.post(`merchant/orders/${order.id}/${v.action}`, v.body ?? {}),
    {
      invalidate: ['merchant/orders', 'kds/'],
      success: (r: unknown) =>
        `Order ${order.orderNumber}: ${humanize((r as { status?: string }).status ?? 'updated')}`,
    },
  );
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const size = compact ? 'sm' : 'default';
  return (
    <div className="flex flex-wrap justify-end gap-2" onClick={stop} onKeyDown={stop}>
      {order.status === 'PLACED' ? (
        <>
          {!compact ? (
            <Select
              aria-label="Preparation time"
              value={prep}
              onChange={(e) => setPrep(e.target.value)}
              className="h-9 w-28"
            >
              {[10, 15, 20, 30, 45].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          ) : null}
          <Button
            size={size}
            loading={move.isPending}
            onClick={() => move.mutate({ action: 'accept', body: { prepTimeMins: Number(prep) } })}
          >
            <Check /> Accept
          </Button>
          <Button size={size} variant="outline" onClick={() => setReject(true)}>
            <X /> Reject
          </Button>
        </>
      ) : null}
      {order.status === 'ACCEPTED' ? (
        <Button
          size={size}
          variant="secondary"
          loading={move.isPending}
          onClick={() => move.mutate({ action: 'preparing' })}
        >
          <ChefHat /> Start preparing
        </Button>
      ) : null}
      {order.status === 'PREPARING' ? (
        <Button
          size={size}
          loading={move.isPending}
          onClick={() => move.mutate({ action: 'ready' })}
        >
          <PackageCheck /> Mark ready
        </Button>
      ) : null}
      {order.status === 'READY' && order.type !== 'DELIVERY' ? (
        <Button
          size={size}
          loading={move.isPending}
          onClick={() => move.mutate({ action: 'complete' })}
        >
          <Check /> Handed over
        </Button>
      ) : null}
      {order.status === 'READY' && order.type === 'DELIVERY' ? (
        <span className="text-xs text-muted-foreground">Waiting for rider</span>
      ) : null}
      <ConfirmDialog
        open={reject}
        onOpenChange={setReject}
        title={`Reject ${order.orderNumber}?`}
        description="The customer is refunded automatically and notified."
        confirmLabel="Reject order"
        destructive
        loading={move.isPending}
        onConfirm={() =>
          move.mutate({ action: 'reject', body: { reason } }, { onSuccess: () => setReject(false) })
        }
      >
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {[
              'Item out of stock',
              'Kitchen too busy',
              'Outlet closing soon',
              'Unable to deliver to this address',
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
      </ConfirmDialog>
    </div>
  );
}

function OrderSheet({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { data: order } = useApi<
    MerchantOrder & {
      deliveryAddress?: { line1?: string; city?: string } | null;
      events?: { toStatus: string; createdAt: string; note: string | null }[];
    }
  >(orderId ? `merchant/orders/${orderId}` : null);
  return (
    <DialogPrimitive.Root open={!!orderId} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent side="right" aria-describedby={undefined} className="max-w-md">
        <DialogPrimitive.Title className="text-lg font-semibold">
          {order?.orderNumber ?? 'Order'}
        </DialogPrimitive.Title>
        {order ? (
          <div className="grid gap-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={order.status} />
              <Badge variant="outline">{humanize(order.type)}</Badge>
              <Badge variant="outline">{humanize(order.channel)}</Badge>
            </div>
            <div>
              <p className="font-medium">{order.customerName ?? 'Guest'}</p>
              <p className="text-muted-foreground">{order.customerPhone}</p>
              {order.deliveryAddress?.line1 ? (
                <p className="text-muted-foreground">{order.deliveryAddress.line1}</p>
              ) : null}
            </div>
            <ul className="divide-y rounded-lg border">
              {order.items?.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 p-3">
                  <div>
                    <p>
                      <span className="font-medium tabular">{i.quantity}×</span> {i.name}
                    </p>
                    {i.variant || i.addons?.length ? (
                      <p className="text-xs text-muted-foreground">
                        {[i.variant, ...(i.addons ?? []).map((a) => a.name)]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    ) : null}
                    {i.notes ? <p className="text-xs">Note: {i.notes}</p> : null}
                  </div>
                  <span className="tabular">{formatMoney(i.totalPrice)}</span>
                </li>
              ))}
            </ul>
            {order.specialInstructions ? (
              <p className="rounded-md bg-muted p-3">“{order.specialInstructions}”</p>
            ) : null}
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="tabular">{formatMoney(order.total)}</span>
            </div>
            {order.events?.length ? (
              <ol className="grid gap-1 text-xs text-muted-foreground">
                {order.events.map((e, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{humanize(e.toStatus)}</span>
                    <span className="tabular">{formatTime(e.createdAt)}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            <OrderActions order={order} />
          </div>
        ) : null}
      </SheetContent>
    </DialogPrimitive.Root>
  );
}
