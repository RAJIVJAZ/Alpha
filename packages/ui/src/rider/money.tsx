'use client';

import * as React from 'react';
import { Banknote, Wallet } from 'lucide-react';
import { CategoryBarChart, Meter } from '../charts';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { chartDays, DateRangePicker, useDateRange } from '../components/date-range';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Select } from '../components/form';
import { EmptyState, FilterBar, PageHeader, StatGrid } from '../components/layout';
import { StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import { api, type Paged } from '../lib/api';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatShortDate,
  formatWeekday,
  humanize,
  istDate,
} from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { cn } from '../lib/utils';
import type { Delivery, Earnings, RiderIncentive, RiderProfile } from './types';

interface WalletView {
  wallet: { id: string; balance: string; status: string };
  transactions: {
    id: string;
    type: 'CREDIT' | 'DEBIT';
    reason: string;
    amount: string;
    balanceAfter: string;
    description: string | null;
    createdAt: string;
  }[];
  meta: { page: number; totalPages: number };
}
interface Payout {
  id: string;
  amount: string;
  status: string;
  method: string;
  destination: { upiId?: string; last4?: string } | null;
  utr: string | null;
  failureReason: string | null;
  requestedAt: string;
  processedAt: string | null;
}
interface Attendance {
  month: string;
  presentDays: number;
  onlineHours: number;
  deliveries: number;
  days: {
    date: string;
    status: string;
    onlineMinutes: number;
    deliveryCount: number;
    distanceKm: number;
  }[];
}

/** Earnings dashboard and wallet: what was earned, what's in the wallet, cash-outs. */
export function RiderEarnings() {
  const { range, preset, setPreset } = useDateRange('7d');
  const e = useApi<Earnings>('riders/me/earnings', { from: range.from, to: range.to });
  const [walletPage, setWalletPage] = React.useState(1);
  const wallet = useApi<WalletView>('wallets/me', { as: 'RIDER', page: walletPage, pageSize: 15 });
  const payouts = useApi<Payout[]>('wallets/me/payouts');
  const me = useApi<RiderProfile>('riders/me');
  const [cashOut, setCashOut] = React.useState(false);
  const k = e.data;
  const daily = chartDays(k?.daily, { ...range, preset: 'today' }, { amount: 0, deliveries: 0 });
  const pending = (payouts.data ?? []).some(
    (p) => p.status === 'REQUESTED' || p.status === 'PROCESSING',
  );
  const balance = Number(wallet.data?.wallet.balance ?? 0);

  return (
    <>
      <PageHeader title="Earnings" description="Pay per delivery, distance, tips and incentives" />
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="size-4" aria-hidden /> Wallet balance
            </p>
            <p className="text-3xl font-semibold tabular">{formatMoney(balance)}</p>
            {balance < 0 ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm">
                <StatusBadge status="CASH_DUE" label="Cash due" tone="serious" /> You hold{' '}
                {formatMoney(-balance)} of COD cash beyond your earnings — hand it in at the hub.
              </p>
            ) : null}
            {pending ? (
              <p className="text-sm text-muted-foreground">A cash-out is being processed</p>
            ) : null}
          </div>
          <Button size="lg" onClick={() => setCashOut(true)} disabled={balance < 100 || pending}>
            <Banknote /> Cash out
          </Button>
        </CardContent>
      </Card>
      <FilterBar>
        <DateRangePicker
          value={preset}
          onChange={setPreset}
          options={['today', '7d', '30d', 'mtd']}
        />
      </FilterBar>
      <StatGrid className="grid-cols-2">
        <StatTile label="Earned" value={k ? formatMoney(k.total, { whole: true }) : '—'} />
        <StatTile label="Deliveries" value={k ? formatNumber(k.deliveries) : '—'} />
        <StatTile label="Per delivery" value={k ? formatMoney(k.averagePerDelivery) : '—'} />
        <StatTile label="Today" value={k ? formatMoney(k.today, { whole: true }) : '—'} />
      </StatGrid>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <CategoryBarChart
          title="Earnings per day"
          data={daily?.map((d) => ({ day: formatShortDate(d.date), amount: Math.round(d.amount) }))}
          categoryKey="day"
          categoryLabel="Day"
          series={[{ key: 'amount', label: 'Earnings' }]}
          valueFormat={(v) => formatMoney(v, { whole: true })}
          loading={e.isFetching}
        />
        <Card>
          <CardHeader>
            <CardTitle>Where it came from</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {Object.entries(k?.byType ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([type, amount]) => (
                <div key={type} className="flex justify-between">
                  <span className="text-muted-foreground">{humanize(type)}</span>
                  <span className="tabular">{formatMoney(amount)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Wallet activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {(wallet.data?.transactions ?? []).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    {t.description ?? humanize(t.reason)}
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(t.createdAt)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 whitespace-nowrap tabular font-medium',
                      t.type === 'CREDIT' ? 'text-delta-up' : '',
                    )}
                  >
                    {t.type === 'CREDIT' ? '+' : '−'}
                    {formatMoney(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
            {wallet.data && wallet.data.meta.totalPages > 1 ? (
              <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={walletPage <= 1}
                  onClick={() => setWalletPage(walletPage - 1)}
                >
                  Newer
                </Button>
                <span className="text-muted-foreground">
                  {walletPage} / {wallet.data.meta.totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={walletPage >= wallet.data.meta.totalPages}
                  onClick={() => setWalletPage(walletPage + 1)}
                >
                  Older
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cash-outs</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {(payouts.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {formatMoney(p.amount)} to{' '}
                    {p.destination?.upiId ?? `A/c ••${p.destination?.last4 ?? ''}`}
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(p.requestedAt)}
                      {p.utr ? ` · ${p.utr}` : ''}
                      {p.failureReason ? ` · ${p.failureReason}` : ''}
                    </span>
                  </span>
                  <StatusBadge status={p.status} label={humanize(p.status)} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      {cashOut ? (
        <CashOutDialog balance={balance} profile={me.data} onClose={() => setCashOut(false)} />
      ) : null}
    </>
  );
}

function CashOutDialog({
  balance,
  profile,
  onClose,
}: {
  balance: number;
  profile: RiderProfile | undefined;
  onClose: () => void;
}) {
  const [amount, setAmount] = React.useState(String(Math.floor(balance)));
  const [method, setMethod] = React.useState<'UPI' | 'BANK_TRANSFER'>(
    profile?.upiId ? 'UPI' : 'BANK_TRANSFER',
  );
  const [upi, setUpi] = React.useState(profile?.upiId ?? '');
  const request = useApiMutation(
    () =>
      api.post('wallets/me/payouts', {
        amount: Number(amount),
        method,
        destination:
          method === 'UPI'
            ? { upiId: upi }
            : { ifsc: profile?.bankAccount?.ifsc, last4: profile?.bankAccount?.last4 },
      }),
    {
      invalidate: ['wallets/me'],
      success: 'Cash-out requested — usually paid within a working day',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cash out</DialogTitle>
          <DialogDescription>
            The amount is held from your wallet straight away; if the transfer fails it comes back.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), request.mutate())}>
          <Field label={`Amount (₹100 to ${formatMoney(balance)})`}>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Send to">
            <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER" disabled={!profile?.bankAccount}>
                Bank account{' '}
                {profile?.bankAccount?.last4 ? `••${profile.bankAccount.last4}` : '(not added)'}
              </option>
            </Select>
          </Field>
          {method === 'UPI' ? (
            <Field label="UPI ID">
              <Input
                value={upi}
                onChange={(e) => setUpi(e.target.value)}
                placeholder="name@bank"
                required
              />
            </Field>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              loading={request.isPending}
              disabled={!(Number(amount) >= 100 && Number(amount) <= balance)}
            >
              Request {Number(amount) > 0 ? formatMoney(Number(amount)) : ''}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Incentive progress and attendance for the month. */
export function RiderPerformance() {
  const incentives = useApi<RiderIncentive[]>('riders/me/incentives');
  const me = useApi<RiderProfile>('riders/me');
  const [month, setMonth] = React.useState(() => istDate(0).slice(0, 7));
  const att = useApi<Attendance>('riders/me/attendance', { month });
  const a = att.data;
  const [y, m] = month.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const byDate = new Map((a?.days ?? []).map((d) => [d.date.slice(0, 10), d]));
  return (
    <>
      <PageHeader
        title="Incentives & attendance"
        description="Weekly targets and the days you worked"
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(incentives.data ?? []).map((i) => (
          <Card key={i.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{i.name}</CardTitle>
                <span className="text-lg font-semibold tabular">
                  {formatMoney(i.rewardAmount, { whole: true })}
                </span>
              </div>
              <CardDescription>{i.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Meter label={`${i.progress} of ${i.target}`} value={i.progress} max={i.target} />
              {i.type === 'RATING' &&
              i.minRating &&
              me.data &&
              me.data.rating < i.minRating &&
              i.status !== 'ACHIEVED' ? (
                <p className="text-xs text-muted-foreground">
                  Your rating is {me.data.rating.toFixed(1)} — deliveries count once it is back to{' '}
                  {i.minRating}.
                </p>
              ) : null}
              <p className="flex items-center justify-between text-xs text-muted-foreground">
                {/* schemes end at midnight; show the last day that counts */}
                <span>Ends {formatWeekday(new Date(new Date(i.endsAt).getTime() - 1))}</span>
                <StatusBadge
                  status={i.status === 'ACHIEVED' ? 'ACHIEVED' : 'IN_PROGRESS'}
                  label={humanize(i.status)}
                />
              </p>
            </CardContent>
          </Card>
        ))}
        {incentives.data && !incentives.data.length ? (
          <EmptyState
            title="No incentives running"
            description="New weekly targets appear here every Monday."
          />
        ) : null}
      </div>
      <Card className="mt-6">
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>
              {a
                ? `${a.presentDays} days worked · ${formatNumber(a.onlineHours, { decimals: true })} h online · ${a.deliveries} deliveries`
                : 'Loading…'}
            </CardDescription>
          </div>
          <Input
            type="month"
            aria-label="Month"
            className="w-40"
            value={month}
            max={istDate(0).slice(0, 7)}
            onChange={(e) => setMonth(e.target.value)}
          />
        </CardHeader>
        <CardContent>
          <div
            className="grid grid-cols-7 gap-1 text-center text-xs"
            role="grid"
            aria-label="Days worked this month"
          >
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d} className="pb-1 text-muted-foreground">
                {d}
              </span>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`;
              const d = byDate.get(date);
              return (
                <span
                  key={date}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center rounded-md border text-sm',
                    d?.status === 'PRESENT'
                      ? 'border-transparent bg-[var(--chart-1)] text-white'
                      : 'text-muted-foreground',
                  )}
                  title={
                    d
                      ? `${d.deliveryCount} deliveries, ${Math.round(d.onlineMinutes / 60)} h online`
                      : 'Off'
                  }
                >
                  {i + 1}
                  {d ? <span className="text-[10px] opacity-90">{d.deliveryCount}</span> : null}
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/** Completed and failed deliveries. */
export function RiderHistory() {
  const [page, setPage] = React.useState(1);
  const list = useApi<Paged<Delivery>>('riders/me/deliveries', { page });
  return (
    <>
      <PageHeader title="Trips" description="Your recent deliveries" />
      <ul className="grid gap-2">
        {(list.data?.data ?? []).map((d) => (
          <li key={d.id}>
            <Card>
              <CardContent className="flex items-center justify-between gap-3 pt-5 text-sm">
                <span>
                  <span className="font-medium">{d.pickupName}</span> → {d.dropName ?? 'Customer'}
                  <span className="block text-xs text-muted-foreground">
                    {d.orderNumber} · {formatDateTime(d.deliveredAt ?? d.createdAt)} ·{' '}
                    {formatNumber(d.distanceKm, { decimals: true })} km
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold tabular">
                    {formatMoney(Number(d.riderEarning) + Number(d.tipAmount))}
                  </span>
                  <StatusBadge status={d.status} />
                </span>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {list.data && list.data.meta.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
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
    </>
  );
}
