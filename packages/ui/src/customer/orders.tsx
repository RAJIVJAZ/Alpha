'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bike, Check, Home, Phone, Receipt, RotateCcw, Star, Store } from 'lucide-react';
import { Button } from '../components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import { ConfirmDialog } from '../components/dialog';
import { Field, Select, Textarea } from '../components/form';
import { EmptyState, ErrorNotice } from '../components/layout';
import { Skeleton } from '../components/misc';
import { StatusBadge } from '../components/status';
import { Thumb } from '../components/thumb';
import { api, type Paged } from '../lib/api';
import { formatDateTime, formatMoney, formatTime, humanize } from '../lib/format';
import { toast, useApi, useApiMutation } from '../lib/hooks';
import { cn } from '../lib/utils';
import { VegMark } from './common';
import { Bill, usePayment } from './checkout';
import type { OrderDetail, OrderSummary, PaymentMethod, Tracking } from './types';

const ACTIVE = [
  'PENDING_PAYMENT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];
const CANCELLABLE = ['PENDING_PAYMENT', 'PLACED'];
const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Being prepared',
  READY: 'Ready',
  PICKED_UP: 'On the way',
  OUT_FOR_DELIVERY: 'On the way',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Declined by the restaurant',
};
const label = (s: string) => STATUS_LABEL[s] ?? humanize(s);

/* ------------------------------------------------------------------ list */

export function OrdersView() {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const list = useApi<Paged<OrderSummary>>('orders', { page, pageSize: 10 });
  const reorder = useApiMutation((id: string) => api.post(`orders/${id}/reorder`), {
    onSuccess: () => router.push('/cart'),
  });
  if (list.error) return <ErrorNotice error={list.error} />;
  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="text-2xl font-semibold">Your orders</h1>
      {list.isLoading ? <Skeleton className="h-64" /> : null}
      {list.data && !list.data.data.length ? (
        <EmptyState
          icon={<Receipt />}
          title="No orders yet"
          description="Your orders and their live status show up here."
          action={
            <Button asChild>
              <Link href="/">Find food</Link>
            </Button>
          }
        />
      ) : null}
      <ul className="grid grid-cols-1 gap-3">
        {(list.data?.data ?? []).map((o) => {
          const active = ACTIVE.includes(o.status);
          const done = o.status === 'DELIVERED' || o.status === 'COMPLETED';
          return (
            <li key={o.id} className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <Thumb src={o.outlet.coverImageUrl} className="size-14" />
                <div className="min-w-0 flex-1">
                  <Link href={`/orders/${o.id}`} className="font-semibold hover:underline">
                    {o.outlet.name}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.orderNumber} · {formatDateTime(o.placedAt ?? o.createdAt)} ·{' '}
                    {formatMoney(o.total)}
                  </p>
                </div>
                <StatusBadge status={o.status} label={label(o.status)} />
              </div>
              <div className="flex flex-wrap gap-2">
                {active ? (
                  <Button asChild size="sm">
                    <Link href={`/orders/${o.id}`}>Track order</Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/orders/${o.id}`}>Details</Link>
                  </Button>
                )}
                {done || o.status === 'CANCELLED' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={reorder.isPending && reorder.variables === o.id}
                    onClick={() => reorder.mutate(o.id)}
                  >
                    <RotateCcw /> Reorder
                  </Button>
                ) : null}
                {done && !o.review ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/orders/${o.id}#rate`}>
                      <Star /> Rate
                    </Link>
                  </Button>
                ) : o.review ? (
                  <span className="flex items-center gap-1 self-center text-xs text-muted-foreground">
                    You rated {o.review.rating}
                    <Star className="size-3 fill-current" aria-hidden />
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {list.data && list.data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Newer
          </Button>
          <span className="text-muted-foreground">
            {page} / {list.data.meta.totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= list.data.meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Older
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ detail & tracking */

export function OrderView({ id }: { id: string }) {
  const order = useApi<OrderDetail>(`orders/${id}`);
  const live = !!order.data && ACTIVE.includes(order.data.status);
  const track = useApi<Tracking>(order.data ? `orders/${id}/track` : null, undefined, {
    refetchInterval: live ? 10_000 : false,
  });
  const o = order.data;
  const t = track.data;
  // the order row lags the tracking snapshot; refresh it when the status moves on
  React.useEffect(() => {
    if (t && o && t.status !== o.status) void order.refetch();
  }, [t, o, order]);
  if (order.error)
    return (
      <EmptyState
        title="Order not found"
        action={
          <Button asChild variant="outline">
            <Link href="/orders">Your orders</Link>
          </Button>
        }
      />
    );
  if (!o) return <Skeleton className="h-96" />;
  const delivery = o.type === 'DELIVERY';
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{o.outlet.name}</h1>
            <p className="text-sm text-muted-foreground">
              {o.orderNumber} · {formatDateTime(o.placedAt ?? o.createdAt)}
            </p>
          </div>
          <StatusBadge status={o.status} label={label(o.status)} />
        </div>
        <StatusHero order={o} tracking={t} />
        {o.status === 'PENDING_PAYMENT' && o.paymentStatus !== 'PAID' ? (
          <RetryPayment order={o} onPaid={() => void order.refetch()} />
        ) : null}
        {live && delivery && t ? <TrackingMap tracking={t} /> : null}
        {t?.rider && live ? <RiderCard rider={t.rider} /> : null}
        <Timeline order={o} tracking={t} />
        {(o.status === 'DELIVERED' || o.status === 'COMPLETED') && !o.review ? (
          <ReviewForm order={o} onDone={() => void order.refetch()} />
        ) : null}
        {o.review ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            You rated this order {o.review.rating}
            <Star className="size-3.5 fill-current" aria-hidden />
            {o.review.comment ? ` — “${o.review.comment}”` : ''}
          </p>
        ) : null}
      </div>
      <aside className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {o.items.map((i) => (
              <div key={i.id} className="flex items-start gap-2 text-sm">
                <VegMark veg={i.isVeg} className="mt-0.5" />
                <span className="flex-1">
                  {i.quantity} × {i.name}
                  {i.variant || i.addons.length ? (
                    <span className="block text-xs text-muted-foreground">
                      {[i.variant, ...i.addons.map((a) => a.name)].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </span>
                <span className="tabular">{formatMoney(i.totalPrice)}</span>
              </div>
            ))}
            <div className="mt-2 border-t pt-3">
              <Bill pricing={{ ...o, savings: '0', messages: [] }} delivery={delivery} />
            </div>
            <p className="text-xs text-muted-foreground">
              Paid by {humanize(o.paymentMethod)} · {humanize(o.paymentStatus)}
            </p>
          </CardContent>
        </Card>
        {delivery && o.deliveryAddress ? (
          <Card>
            <CardContent className="grid gap-1 pt-5 text-sm">
              <span className="font-medium">Delivering to {o.deliveryAddress.label ?? ''}</span>
              <span className="text-muted-foreground">
                {o.deliveryAddress.line1}
                {o.deliveryAddress.city ? `, ${o.deliveryAddress.city}` : ''}{' '}
                {o.deliveryAddress.pincode ?? ''}
              </span>
            </CardContent>
          </Card>
        ) : null}
        {CANCELLABLE.includes(o.status) ? (
          <CancelOrder id={o.id} onDone={() => void order.refetch()} />
        ) : null}
        {o.outlet.phone ? (
          <Button asChild variant="outline">
            <a href={`tel:${o.outlet.phone}`}>
              <Phone /> Call the restaurant
            </a>
          </Button>
        ) : null}
      </aside>
    </div>
  );
}

function StatusHero({
  order: o,
  tracking: t,
}: {
  order: OrderDetail;
  tracking: Tracking | undefined;
}) {
  const status = t?.status ?? o.status;
  const live = ACTIVE.includes(status);
  const message: Record<string, string> = {
    PENDING_PAYMENT: 'Complete the payment to send your order to the kitchen.',
    PLACED: 'Waiting for the restaurant to confirm.',
    ACCEPTED: 'The restaurant has accepted your order.',
    PREPARING: 'Your food is being prepared.',
    READY:
      o.type === 'DELIVERY'
        ? t?.rider
          ? `${t.rider.name.split(' ')[0]} is picking it up.`
          : 'Ready — assigning a rider.'
        : 'Ready for pickup at the counter.',
    PICKED_UP: 'Your order is on the way.',
    OUT_FOR_DELIVERY: 'Your order is on the way.',
    DELIVERED: 'Delivered. Enjoy your meal!',
    COMPLETED: 'Completed. Enjoy your meal!',
    CANCELLED: o.cancelReason
      ? `Cancelled: ${o.cancelReason}`
      : 'This order was cancelled. Any payment is refunded to the original method.',
    REJECTED: o.cancelReason
      ? `The restaurant couldn't take it: ${o.cancelReason}. Your payment is refunded.`
      : "The restaurant couldn't take this order. Your payment is refunded.",
  };
  return (
    <div
      className={cn(
        'grid gap-2 rounded-2xl p-5',
        live ? 'bg-primary text-primary-foreground' : 'border bg-card',
      )}
    >
      <p className="text-lg font-semibold">{message[status] ?? label(status)}</p>
      {live && t?.etaMins != null && o.type === 'DELIVERY' ? (
        <p className="text-sm opacity-90">
          Arriving in about <span className="text-2xl font-bold tabular">{t.etaMins}</span> min
        </p>
      ) : null}
      {t?.deliveryOtp ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Share this code with your rider at the door:
          <span className="rounded-lg bg-white/95 px-3 py-1 font-mono text-xl font-bold tracking-[0.3em] text-foreground">
            {t.deliveryOtp}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** Restaurant, rider and drop on a schematic map (no tiles needed), with a Google Maps hand-off. */
function TrackingMap({ tracking: t }: { tracking: Tracking }) {
  const points = [
    { key: 'outlet', lat: t.outlet.lat, lng: t.outlet.lng, label: 'Restaurant', icon: Store },
    ...(t.drop
      ? [{ key: 'drop', lat: t.drop.lat, lng: t.drop.lng, label: 'You', icon: Home }]
      : []),
    ...(t.rider?.lat != null && t.rider.lng != null
      ? [
          {
            key: 'rider',
            lat: t.rider.lat,
            lng: t.rider.lng,
            label: t.rider.name.split(' ')[0]!,
            icon: Bike,
          },
        ]
      : []),
  ];
  // a narrow canvas keeps pins and labels legible on phones
  const W = 400;
  const H = 220;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [
    Math.min(...lats),
    Math.max(...lats),
    Math.min(...lngs),
    Math.max(...lngs),
  ];
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = (maxLng - minLng) * kx || 0.005;
  const spanY = maxLat - minLat || 0.005;
  const scale = Math.min((W - 100) / spanX, (H - 70) / spanY);
  const ox = (W - spanX * scale) / 2;
  const oy = (H - spanY * scale) / 2;
  const at = (p: { lat: number; lng: number }) =>
    [ox + (p.lng - minLng) * kx * scale, H - oy - (p.lat - minLat) * scale] as const;
  const outlet = at(t.outlet);
  const drop = t.drop ? at(t.drop) : null;
  return (
    <figure className="grid gap-2 rounded-2xl border bg-card p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Map: restaurant, ${t.rider ? 'your rider, ' : ''}and your address`}
      >
        <rect width={W} height={H} rx={12} fill="var(--chart-surface)" />
        {drop ? (
          <line
            x1={outlet[0]}
            y1={outlet[1]}
            x2={drop[0]}
            y2={drop[1]}
            stroke="var(--chart-baseline)"
            strokeWidth={2}
            strokeDasharray="6 6"
          />
        ) : null}
        {points.map((p) => {
          const [x, y] = at(p);
          const rider = p.key === 'rider';
          return (
            <g key={p.key} transform={`translate(${x} ${y})`}>
              <circle
                r={rider ? 16 : 13}
                fill={
                  rider ? 'var(--chart-1)' : p.key === 'drop' ? 'var(--chart-2)' : 'var(--chart-3)'
                }
                stroke="var(--chart-surface)"
                strokeWidth={3}
              />
              <p.icon x={-8} y={-8} width={16} height={16} color="white" aria-hidden />
              <text
                y={rider ? 32 : 29}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="var(--chart-text)"
                stroke="var(--chart-surface)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      {t.drop ? (
        <figcaption className="text-right text-xs">
          <a
            className="text-primary underline-offset-4 hover:underline"
            href={`https://www.google.com/maps/dir/?api=1&origin=${t.outlet.lat},${t.outlet.lng}&destination=${t.drop.lat},${t.drop.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google Maps
          </a>
        </figcaption>
      ) : null}
    </figure>
  );
}

function RiderCard({ rider }: { rider: NonNullable<Tracking['rider']> }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Bike className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{rider.name}</span>
        <span className="block text-xs text-muted-foreground">
          {rider.rating.toFixed(1)} ★{rider.vehicleNumber ? ` · ${rider.vehicleNumber}` : ''}
        </span>
      </span>
      <Button asChild variant="outline" size="sm">
        <a href={`tel:${rider.phone}`} aria-label={`Call ${rider.name}`}>
          <Phone /> Call
        </a>
      </Button>
    </div>
  );
}

function Timeline({
  order: o,
  tracking: t,
}: {
  order: OrderDetail;
  tracking: Tracking | undefined;
}) {
  const events = t?.timeline ?? [];
  const at = (s: string[]) => events.find((e) => s.includes(e.status))?.at;
  const delivery = o.type === 'DELIVERY';
  const steps = [
    { label: 'Order placed', at: at(['PLACED']) },
    { label: 'Accepted by the restaurant', at: at(['ACCEPTED']) },
    { label: 'Being prepared', at: at(['PREPARING']) },
    {
      label: delivery ? 'Picked up by your rider' : 'Ready for pickup',
      at: delivery ? at(['PICKED_UP', 'OUT_FOR_DELIVERY']) : at(['READY']),
    },
    { label: delivery ? 'Delivered' : 'Collected', at: at(['DELIVERED', 'COMPLETED']) },
  ];
  const stopped = ['CANCELLED', 'REJECTED'].includes(o.status);
  return (
    <ol className="grid gap-0 rounded-xl border bg-card p-4" aria-label="Order progress">
      {steps.map((s, i) => {
        const done = !!s.at;
        return (
          <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 ? (
              <span
                className={cn(
                  'absolute left-[11px] top-6 h-[calc(100%-1rem)] w-0.5',
                  done ? 'bg-status-good' : 'bg-border',
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                done ? 'border-status-good bg-status-good text-white' : 'border-border bg-card',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : null}
            </span>
            <span className={cn('text-sm', !done && 'text-muted-foreground')}>
              {s.label}
              {s.at ? (
                <span className="block text-xs text-muted-foreground">{formatTime(s.at)}</span>
              ) : null}
              <span className="sr-only">{done ? ', done' : ', pending'}</span>
            </span>
          </li>
        );
      })}
      {stopped ? (
        <li className="mt-3 text-sm font-medium text-status-critical">{label(o.status)}</li>
      ) : null}
    </ol>
  );
}

function RetryPayment({ order: o, onPaid }: { order: OrderDetail; onPaid: () => void }) {
  const { pay, element } = usePayment();
  const [method, setMethod] = React.useState<Exclude<PaymentMethod, 'COD'>>(
    o.paymentMethod === 'COD' ? 'UPI' : (o.paymentMethod as Exclude<PaymentMethod, 'COD'>),
  );
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-status-warning/40 bg-status-warning/15 p-4">
      <Field label="Pay with" className="min-w-44">
        <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="UPI">UPI</option>
          <option value="CARD">Card</option>
          <option value="NETBANKING">Net banking</option>
          <option value="WALLET">FoodGrid wallet</option>
        </Select>
      </Field>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await pay({ purpose: 'ORDER', referenceId: o.id, method });
            if (r === 'paid') {
              toast.success('Payment received — your order is with the kitchen');
              onPaid();
            } else toast.error(r === 'failed' ? 'Payment failed' : 'Payment not completed');
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Pay {formatMoney(o.total)}
      </Button>
      {element}
    </div>
  );
}

const CANCEL_REASONS = [
  'Ordered by mistake',
  'Want to change items',
  'Delivery is taking too long',
  'Changed my mind',
];

function CancelOrder({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState(CANCEL_REASONS[0]!);
  const cancel = useApiMutation(() => api.post(`orders/${id}/cancel`, { reason }), {
    success: 'Order cancelled — any payment is refunded to the original method',
    onSuccess: () => (setOpen(false), onDone()),
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Cancel order
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this order?"
        description="You can cancel free of charge until the restaurant accepts it."
        confirmLabel="Cancel order"
        destructive
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      >
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {CANCEL_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
      </ConfirmDialog>
    </>
  );
}

const REVIEW_TAGS = [
  'tasty',
  'hot-and-fresh',
  'good-packaging',
  'value-for-money',
  'on-time',
  'polite-rider',
];

function Stars({
  value,
  onChange,
  label: name,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(n)}
          className="rounded p-0.5 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            className={cn(
              'size-7',
              n <= value ? 'fill-[var(--chart-4)] text-[var(--chart-4)]' : 'text-muted-foreground',
            )}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

function ReviewForm({ order: o, onDone }: { order: OrderDetail; onDone: () => void }) {
  const [rating, setRating] = React.useState(0);
  const [food, setFood] = React.useState(0);
  const [rider, setRider] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const delivery = o.type === 'DELIVERY';
  const submit = useApiMutation(
    () =>
      api.post(`orders/${o.id}/review`, {
        rating,
        foodRating: food || undefined,
        deliveryRating: delivery && rider ? rider : undefined,
        comment: comment.trim() || undefined,
        tags: tags.length ? tags : undefined,
      }),
    { success: 'Thanks for the feedback!', onSuccess: onDone },
  );
  return (
    <section id="rate" className="scroll-mt-24">
      <Card>
        <CardHeader>
          <CardTitle>How was your order?</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => (e.preventDefault(), rating && submit.mutate())}
          >
            <div className="grid gap-1">
              <span className="text-sm font-medium">Overall</span>
              <Stars value={rating} onChange={setRating} label="Overall rating" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1">
                <span className="text-sm font-medium">Food</span>
                <Stars value={food} onChange={setFood} label="Food rating" />
              </div>
              {delivery ? (
                <div className="grid gap-1">
                  <span className="text-sm font-medium">Delivery</span>
                  <Stars value={rider} onChange={setRider} label="Delivery rating" />
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="What went well">
              {REVIEW_TAGS.filter((t) => delivery || !['on-time', 'polite-rider'].includes(t)).map(
                (t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    className="rounded-full"
                    variant={tags.includes(t) ? 'default' : 'outline'}
                    aria-pressed={tags.includes(t)}
                    onClick={() =>
                      setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])
                    }
                  >
                    {humanize(t.replace(/-/g, '_'))}
                  </Button>
                ),
              )}
            </div>
            <Field label="Anything else? (optional)">
              <Textarea
                rows={3}
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              disabled={!rating}
              loading={submit.isPending}
              className="justify-self-start"
            >
              Submit review
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
