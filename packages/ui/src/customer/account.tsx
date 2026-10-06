'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, CalendarDays, Crown, MapPin, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Select } from '../components/form';
import { EmptyState, ErrorNotice } from '../components/layout';
import { Switch } from '../components/menu';
import { Meter } from '../charts';
import { Skeleton } from '../components/misc';
import { StatusBadge } from '../components/status';
import { api } from '../lib/api';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  humanize,
  istDate,
} from '../lib/format';
import { toast, useApi, useApiMutation, useSession } from '../lib/hooks';
import { cn } from '../lib/utils';
import { AddressDialog, usePayment } from './checkout';
import type {
  Address,
  MealSubscription,
  MembershipPlan,
  MyMembership,
  Notification,
  NotificationPrefs,
  Profile,
  SubscriptionPlan,
  WalletStatement,
} from './types';

/* ------------------------------------------------------------------ wallet */

const TOPUPS = [200, 500, 1000, 2000];

export function WalletView() {
  const [page, setPage] = React.useState(1);
  const w = useApi<WalletStatement>('wallets/me', { page, pageSize: 15 });
  const [amount, setAmount] = React.useState('500');
  const [busy, setBusy] = React.useState(false);
  const { pay, element } = usePayment();
  const value = Number(amount);
  const valid = value >= 10 && value <= 10_000;
  const topUp = async () => {
    setBusy(true);
    try {
      const r = await pay({ purpose: 'WALLET_TOPUP', method: 'UPI', amount: value });
      if (r === 'paid') {
        toast.success(`${formatMoney(value)} added to your wallet`);
        await w.refetch();
      } else toast.error(r === 'failed' ? 'Payment failed' : 'Payment not completed');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (w.error) return <ErrorNotice error={w.error} />;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[22rem_1fr] lg:items-start">
      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <Wallet className="size-4" aria-hidden /> FoodGrid wallet
          </CardDescription>
          <CardTitle className="text-3xl tabular">
            {w.data ? formatMoney(w.data.wallet.balance) : '—'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Pay in one tap at checkout. Refunds and cashback land here instantly.
          </p>
          <div className="flex flex-wrap gap-2">
            {TOPUPS.map((t) => (
              <Button
                key={t}
                size="sm"
                className="rounded-full"
                variant={Number(amount) === t ? 'default' : 'outline'}
                onClick={() => setAmount(String(t))}
              >
                +{formatMoney(t, { whole: true })}
              </Button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => (e.preventDefault(), valid && void topUp())}
          >
            <Input
              aria-label="Amount to add"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            />
            <Button type="submit" loading={busy} disabled={!valid}>
              Add money
            </Button>
          </form>
          {!valid && amount ? (
            <p className="text-xs text-muted-foreground">Add between ₹10 and ₹10,000 at a time.</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {w.isLoading ? <Skeleton className="h-48" /> : null}
          <ul className="divide-y text-sm">
            {(w.data?.transactions ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  {t.description ?? humanize(t.reason)}
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(t.createdAt)}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 whitespace-nowrap font-medium tabular',
                    t.type === 'CREDIT' && 'text-delta-up',
                  )}
                >
                  {t.type === 'CREDIT' ? '+' : '−'}
                  {formatMoney(t.amount)}
                </span>
              </li>
            ))}
          </ul>
          {w.data && !w.data.transactions.length ? <EmptyState title="No activity yet" /> : null}
          {w.data && w.data.meta.totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Newer
              </Button>
              <span className="text-muted-foreground">
                {page} / {w.data.meta.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= w.data.meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Older
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {element}
    </div>
  );
}

/* ------------------------------------------------------------------ membership */

export function MembershipView() {
  const { data: session } = useSession();
  const plans = useApi<MembershipPlan[]>('memberships/plans');
  const mine = useApi<MyMembership>(session ? 'memberships/me' : null);
  const { pay, element } = usePayment();
  const [busy, setBusy] = React.useState<string | null>(null);
  const active = mine.data?.active ?? null;
  const buy = async (plan: MembershipPlan) => {
    if (!session) return window.location.assign('/login?next=/membership');
    setBusy(plan.id);
    try {
      const m = await api.post<{ id: string }>('memberships', { planId: plan.id });
      const r = await pay({ purpose: 'MEMBERSHIP', referenceId: m.id, method: 'UPI' });
      if (r === 'paid') {
        toast.success(`Welcome to ${plan.name}!`);
        // activation happens when payment-service reports the capture
        setTimeout(() => void mine.refetch(), 1500);
      } else toast.error(r === 'failed' ? 'Payment failed' : 'Payment not completed');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="grid grid-cols-1 gap-6">
      <section className="grid gap-2 rounded-2xl bg-gradient-to-br from-orange-600 to-rose-800 p-6 text-white">
        <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide opacity-90">
          <Crown className="size-4" aria-hidden /> FoodGrid One
        </p>
        <h1 className="text-2xl font-bold">Free delivery and extra savings on every order</h1>
        {active ? (
          <p className="text-sm opacity-95">
            You&apos;re a member until {formatDate(active.endsAt)} · saved{' '}
            {formatMoney(active.savings, { whole: true })} so far
          </p>
        ) : (
          <p className="text-sm opacity-95">Pays for itself in a couple of orders.</p>
        )}
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {(plans.data ?? []).map((p) => {
          const current = active?.plan.id === p.id;
          return (
            <Card key={p.id} className={cn(current && 'border-primary')}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  {p.name} {current ? <Badge variant="good">Your plan</Badge> : null}
                </CardTitle>
                <CardDescription>{p.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p>
                  <span className="text-2xl font-semibold tabular">
                    {formatMoney(p.price, { whole: true })}
                  </span>
                  <span className="text-sm text-muted-foreground"> / {p.durationDays} days</span>
                </p>
                <ul className="grid gap-1 text-sm">
                  {p.benefits.freeDeliveryAbove != null ? (
                    <li>
                      Free delivery above{' '}
                      {formatMoney(p.benefits.freeDeliveryAbove, { whole: true })}
                    </li>
                  ) : null}
                  {p.benefits.extraDiscountPct ? (
                    <li>
                      {p.benefits.extraDiscountPct}% extra off
                      {p.benefits.maxDiscountPerOrder
                        ? `, up to ${formatMoney(p.benefits.maxDiscountPerOrder, { whole: true })} an order`
                        : ''}
                    </li>
                  ) : null}
                </ul>
                <Button
                  loading={busy === p.id}
                  disabled={!!busy}
                  variant={current ? 'outline' : 'default'}
                  onClick={() => buy(p)}
                >
                  {current ? 'Extend' : active ? 'Switch' : 'Join'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {element}
    </div>
  );
}

/* ------------------------------------------------------------------ meal subscriptions */

const SLOT: Record<string, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACKS: 'Snacks',
};
const DEFAULT_TIME: Record<string, string> = {
  BREAKFAST: '08:00',
  LUNCH: '13:00',
  DINNER: '20:00',
  SNACKS: '17:00',
};

/** Subscribe to a meal plan: start date, delivery time and address, then pay. */
export function SubscribeDialog({
  plan,
  outletName,
  onClose,
}: {
  plan: SubscriptionPlan;
  outletName: string;
  onClose: () => void;
}) {
  const addresses = useApi<Address[]>('users/me/addresses');
  const [start, setStart] = React.useState(istDate(1));
  const [time, setTime] = React.useState(DEFAULT_TIME[plan.slot] ?? '13:00');
  const [addressId, setAddressId] = React.useState<string>('');
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const { pay, element } = usePayment();
  const address =
    (addresses.data ?? []).find((a) => a.id === addressId) ??
    (addresses.data ?? []).find((a) => a.isDefault) ??
    addresses.data?.[0];
  const submit = async () => {
    if (!address) return;
    setBusy(true);
    try {
      const sub = await api.post<{ id: string; amountPaid: string }>('meal-subscriptions', {
        planId: plan.id,
        startDate: start,
        deliveryTime: time,
        deliveryAddress: {
          label: address.label,
          contactName: address.contactName ?? undefined,
          contactPhone: address.contactPhone ?? undefined,
          line1: address.line1,
          line2: address.line2 ?? undefined,
          landmark: address.landmark ?? undefined,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          lat: address.lat,
          lng: address.lng,
        },
      });
      const r = await pay({ purpose: 'MEAL_SUBSCRIPTION', referenceId: sub.id, method: 'UPI' });
      if (r === 'paid') {
        toast.success(`Subscribed — first meal on ${formatDate(start)}`);
        onClose();
        window.location.assign('/subscriptions');
      } else toast.error(r === 'failed' ? 'Payment failed' : 'Payment not completed');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan.name}</DialogTitle>
          <DialogDescription>
            From {outletName} · {SLOT[plan.slot] ?? plan.slot} ·{' '}
            {formatMoney(plan.totalPrice, { whole: true })}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), void submit())}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start on">
              <Input
                type="date"
                min={istDate(0)}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </Field>
            <Field label="Deliver at">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </Field>
          </div>
          <Field label="Deliver to">
            <Select
              value={address?.id ?? ''}
              onChange={(e) =>
                e.target.value === '__new' ? setAdding(true) : setAddressId(e.target.value)
              }
              required
            >
              {(addresses.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {a.line1}
                </option>
              ))}
              <option value="__new">+ Add a new address</option>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            Skip any day from Meal plans at least a day ahead; your plan extends automatically.
          </p>
          <DialogFooter>
            <Button type="submit" loading={busy} disabled={!address}>
              Pay {formatMoney(plan.totalPrice, { whole: true })}
            </Button>
          </DialogFooter>
        </form>
        {adding ? (
          <AddressDialog onClose={() => setAdding(false)} onSaved={(a) => setAddressId(a.id)} />
        ) : null}
        {element}
      </DialogContent>
    </Dialog>
  );
}

export function SubscriptionsView() {
  const subs = useApi<MealSubscription[]>('meal-subscriptions');
  const [pausing, setPausing] = React.useState<MealSubscription | null>(null);
  const [cancelling, setCancelling] = React.useState<MealSubscription | null>(null);
  const cancel = useApiMutation((id: string) => api.post(`meal-subscriptions/${id}/cancel`), {
    invalidate: ['meal-subscriptions'],
    success: 'Subscription cancelled',
    onSuccess: () => setCancelling(null),
  });
  if (subs.error) return <ErrorNotice error={subs.error} />;
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Meal plans</h1>
      {subs.isLoading ? <Skeleton className="h-48" /> : null}
      {subs.data && !subs.data.length ? (
        <EmptyState
          icon={<CalendarDays />}
          title="No meal plans yet"
          description="Tiffin and meal plans from nearby kitchens appear on their pages under “Meal plans”."
          action={
            <Button asChild variant="outline">
              <Link href="/">Browse kitchens</Link>
            </Button>
          }
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {(subs.data ?? []).map((s) => {
          const live = s.status === 'ACTIVE' || s.status === 'PAUSED';
          return (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  {s.plan.name}
                  <StatusBadge status={s.status} label={humanize(s.status)} />
                </CardTitle>
                <CardDescription>
                  {SLOT[s.slot] ?? s.slot} at {s.deliveryTime} · {formatDate(s.startDate)} to{' '}
                  {formatDate(s.endDate)}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Meter
                  label={`${s.mealsDelivered} of ${s.mealsTotal} meals delivered`}
                  value={s.mealsDelivered}
                  max={s.mealsTotal}
                />
                {s.pausedDates.length ? (
                  <p className="text-xs text-muted-foreground">
                    Skipping {s.pausedDates.map((d) => formatDate(d)).join(', ')}
                  </p>
                ) : null}
                {live ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPausing(s)}>
                      Skip days
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCancelling(s)}>
                      Cancel plan
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {pausing ? <SkipDaysDialog sub={pausing} onClose={() => setPausing(null)} /> : null}
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => (!o ? setCancelling(null) : undefined)}
        title="Cancel this meal plan?"
        description="No more meals are delivered from tomorrow. Contact support about refunds for meals not yet delivered."
        confirmLabel="Cancel plan"
        destructive
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
      />
    </div>
  );
}

function SkipDaysDialog({ sub, onClose }: { sub: MealSubscription; onClose: () => void }) {
  const upcoming = React.useMemo(() => Array.from({ length: 14 }, (_, i) => istDate(i + 1)), []);
  const already = new Set(sub.pausedDates.map((d) => d.slice(0, 10)));
  const [picked, setPicked] = React.useState<string[]>([]);
  const pause = useApiMutation(
    () => api.post(`meal-subscriptions/${sub.id}/pause`, { dates: picked }),
    {
      invalidate: ['meal-subscriptions'],
      success: 'Days skipped — your plan now ends later',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skip days</DialogTitle>
          <DialogDescription>
            Pick the days you don&apos;t want a meal. Skipped meals move to the end of the plan.
          </DialogDescription>
        </DialogHeader>
        <div
          className="grid grid-cols-4 gap-2 sm:grid-cols-7"
          role="group"
          aria-label="Upcoming days"
        >
          {upcoming.map((d) => {
            const on = picked.includes(d) || already.has(d);
            return (
              <button
                key={d}
                type="button"
                disabled={already.has(d)}
                aria-pressed={on}
                onClick={() =>
                  setPicked(picked.includes(d) ? picked.filter((x) => x !== d) : [...picked, d])
                }
                className={cn(
                  'rounded-lg border px-2 py-2 text-xs',
                  on ? 'border-primary bg-accent font-semibold' : 'hover:bg-muted',
                  already.has(d) && 'opacity-60',
                )}
              >
                {new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'Asia/Kolkata',
                })}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            disabled={!picked.length}
            loading={pause.isPending}
            onClick={() => pause.mutate()}
          >
            Skip {picked.length || ''} day{picked.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ account */

export function AccountView() {
  const me = useApi<Profile>('users/me');
  const addresses = useApi<Address[]>('users/me/addresses');
  const prefs = useApi<NotificationPrefs>('notifications/preferences');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [editing, setEditing] = React.useState<Address | null | 'new'>(null);
  const [deleting, setDeleting] = React.useState<Address | null>(null);
  React.useEffect(() => {
    if (!me.data) return;
    setName(me.data.name ?? '');
    setEmail(me.data.email ?? '');
  }, [me.data]);
  const saveProfile = useApiMutation(
    () => api.patch('users/me', { name: name.trim(), email: email.trim() || undefined }),
    { invalidate: ['users/me', 'session'], success: 'Profile saved' },
  );
  const remove = useApiMutation((id: string) => api.delete(`users/me/addresses/${id}`), {
    invalidate: ['users/me/addresses'],
    success: 'Address removed',
    onSuccess: () => setDeleting(null),
  });
  const makeDefault = useApiMutation(
    (id: string) => api.patch(`users/me/addresses/${id}`, { isDefault: true }),
    { invalidate: ['users/me/addresses'] },
  );
  const setPref = useApiMutation(
    (patch: Partial<NotificationPrefs>) => api.put('notifications/preferences', patch),
    { invalidate: ['notifications/preferences'] },
  );
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>{me.data?.phone}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), saveProfile.mutate())}>
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                autoComplete="name"
              />
            </Field>
            <Field label="Email (for receipts)">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <div className="flex items-center justify-between gap-3">
              {me.data?.referralCode ? (
                <span className="text-sm text-muted-foreground">
                  Invite code{' '}
                  <span className="font-mono font-semibold text-foreground">
                    {me.data.referralCode}
                  </span>
                </span>
              ) : (
                <span />
              )}
              <Button type="submit" loading={saveProfile.isPending}>
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Addresses</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
            <Plus /> Add
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2">
          {(addresses.data ?? []).map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
              <MapPin className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{a.label}</span>{' '}
                {a.isDefault ? <Badge variant="neutral">Default</Badge> : null}
                <span className="block text-muted-foreground">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.pincode}
                </span>
                {!a.isDefault ? (
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                    onClick={() => makeDefault.mutate(a.id)}
                  >
                    Make default
                  </button>
                ) : null}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Edit ${a.label} address`}
                onClick={() => setEditing(a)}
              >
                <Pencil />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${a.label} address`}
                onClick={() => setDeleting(a)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {addresses.data && !addresses.data.length ? (
            <p className="text-sm text-muted-foreground">No saved addresses.</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Order updates always reach you in the app.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {prefs.data
            ? (
                [
                  ['pushEnabled', 'Push notifications'],
                  ['smsEnabled', 'SMS'],
                  ['emailEnabled', 'Email receipts'],
                  ['marketingEnabled', 'Offers and recommendations'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center justify-between gap-3 text-sm">
                  {l}
                  <Switch
                    checked={prefs.data![k]}
                    onCheckedChange={(v) => setPref.mutate({ [k]: v })}
                    aria-label={l}
                  />
                </label>
              ))
            : null}
          {prefs.data ? (
            <p className="text-xs text-muted-foreground">
              Quiet hours {prefs.data.quietHoursStart ?? '—'}–{prefs.data.quietHoursEnd ?? '—'}: no
              promotional messages.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>More</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {[
            ['/orders', 'Your orders'],
            ['/wallet', 'Wallet'],
            ['/membership', 'FoodGrid One membership'],
            ['/subscriptions', 'Meal plans'],
            ['/notifications', 'Notifications'],
          ].map(([href, l]) => (
            <Link key={href} href={href!} className="rounded-lg px-2 py-1.5 hover:bg-muted">
              {l}
            </Link>
          ))}
          <button
            type="button"
            className="rounded-lg px-2 py-1.5 text-left text-status-critical hover:bg-muted"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.assign('/');
            }}
          >
            Sign out
          </button>
        </CardContent>
      </Card>
      {editing ? (
        <AddressDialog
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => (!o ? setDeleting(null) : undefined)}
        title={`Delete ${deleting?.label ?? ''} address?`}
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ notifications */

export function NotificationsView() {
  const list = useApi<{ data: Notification[] }>('notifications', { page: 1 });
  const readAll = useApiMutation(() => api.post('notifications/read-all'), {
    invalidate: ['notifications'],
  });
  const read = useApiMutation((id: string) => api.post(`notifications/${id}/read`), {
    invalidate: ['notifications'],
  });
  const rows = list.data?.data ?? [];
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {rows.some((n) => !n.readAt) ? (
          <Button
            size="sm"
            variant="outline"
            loading={readAll.isPending}
            onClick={() => readAll.mutate()}
          >
            Mark all as read
          </Button>
        ) : null}
      </div>
      {list.isLoading ? <Skeleton className="h-48" /> : null}
      {list.data && !rows.length ? (
        <EmptyState icon={<Bell />} title="You're all caught up" />
      ) : null}
      <ul className="grid gap-2">
        {rows.map((n) => {
          const orderId = typeof n.data?.orderId === 'string' ? n.data.orderId : null;
          const body = (
            <>
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium">{n.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelative(n.createdAt)}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">{n.body}</span>
            </>
          );
          const cls = cn(
            'grid gap-1 rounded-xl border bg-card px-4 py-3 text-left',
            !n.readAt && 'border-primary/40 bg-accent/60',
          );
          return (
            <li key={n.id}>
              {orderId ? (
                <Link
                  href={`/orders/${orderId}`}
                  className={cls}
                  onClick={() => !n.readAt && read.mutate(n.id)}
                >
                  {body}
                </Link>
              ) : (
                <button
                  type="button"
                  className={cn(cls, 'w-full')}
                  onClick={() => !n.readAt && read.mutate(n.id)}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
