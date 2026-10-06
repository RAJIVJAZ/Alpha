'use client';

import * as React from 'react';
import { Banknote, Pencil, Play, Plus } from 'lucide-react';
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
} from '../components/dialog';
import { Field, Input, Select } from '../components/form';
import { FilterBar, PageHeader } from '../components/layout';
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/menu';
import { StatusBadge } from '../components/status';
import { api, type Paged } from '../lib/api';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatShortDate,
  humanize,
  istDate,
} from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import type { Settlement } from '../merchant/types';
import type { AdminTenant } from './types';

type AdminSettlement = Settlement & { tenantId: string; tenantName: string | null };
interface Rule {
  id: string;
  name: string;
  tenantType: string | null;
  tenantId: string | null;
  tenantName: string | null;
  outletId: string | null;
  ratePct: string;
  fixedFee: string;
  minFee: string | null;
  maxFee: string | null;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}
interface Payout {
  id: string;
  ownerId: string;
  ownerName: string | null;
  amount: string;
  status: string;
  method: string;
  destination: { upiId?: string; ifsc?: string; last4?: string } | null;
  utr: string | null;
  failureReason: string | null;
  requestedAt: string;
  processedAt: string | null;
}

const TENANT_TYPES = ['RESTAURANT', 'FOOD_CART', 'SUPPLIER', 'WHOLESALER', 'RETAILER'] as const;
const weekLabel = (s: Pick<Settlement, 'periodStart' | 'periodEnd'>) =>
  `${formatShortDate(s.periodStart)} – ${formatShortDate(new Date(new Date(s.periodEnd).getTime() - 1))}`;

/** The Monday that starts the IST week `weeksAgo` weeks back. */
function weekStart(weeksAgo: number) {
  const today = new Date(`${istDate(0)}T00:00:00Z`);
  const back = (today.getUTCDay() + 6) % 7;
  return new Date(today.getTime() - (back + 7 * weeksAgo) * 86_400_000).toISOString().slice(0, 10);
}

/** Payment settlement, commission management and rider payouts. */
export function FinanceAdmin() {
  return (
    <>
      <PageHeader
        title="Finance"
        description="Weekly merchant settlements, commission rules, rider payouts and COD cash"
      />
      <Tabs defaultValue="settlements">
        <TabsList>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
          <TabsTrigger value="commission">Commission rules</TabsTrigger>
          <TabsTrigger value="payouts">Rider payouts</TabsTrigger>
          <TabsTrigger value="cash">Rider cash</TabsTrigger>
        </TabsList>
        <TabsContent value="settlements">
          <Settlements />
        </TabsContent>
        <TabsContent value="commission">
          <CommissionRules />
        </TabsContent>
        <TabsContent value="payouts">
          <Payouts />
        </TabsContent>
        <TabsContent value="cash">
          <RiderCash />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Settlements() {
  const [status, setStatus] = React.useState('PENDING');
  const [page, setPage] = React.useState(1);
  const [paying, setPaying] = React.useState<AdminSettlement | null>(null);
  const [running, setRunning] = React.useState(false);
  const list = useApi<Paged<AdminSettlement>>('admin/settlements', {
    status: status || undefined,
    page,
    pageSize: 25,
  });
  const due = (list.data?.data ?? [])
    .filter((s) => s.status === 'PENDING')
    .reduce((a, s) => a + Number(s.netPayable), 0);
  const columns: Column<AdminSettlement>[] = [
    {
      key: 'biz',
      header: 'Business',
      cell: (s) => <span className="font-medium">{s.tenantName ?? s.tenantId}</span>,
    },
    { key: 'week', header: 'Week', cell: (s) => weekLabel(s) },
    { key: 'orders', header: 'Orders', align: 'right', cell: (s) => s.ordersCount },
    {
      key: 'gross',
      header: 'Sales (ex-GST)',
      align: 'right',
      cell: (s) => formatMoney(s.grossSales, { whole: true }),
    },
    {
      key: 'comm',
      header: 'Commission + GST',
      align: 'right',
      cell: (s) => formatMoney(Number(s.commission) + Number(s.commissionGst), { whole: true }),
    },
    {
      key: 'net',
      header: 'Net payable',
      align: 'right',
      sortValue: (s) => Number(s.netPayable),
      cell: (s) => <span className="font-semibold">{formatMoney(s.netPayable)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (s) => <StatusBadge status={s.status} label={humanize(s.status)} />,
    },
    {
      key: 'act',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (s) =>
        s.status === 'PENDING' ? (
          <Button size="sm" variant="outline" onClick={() => setPaying(s)}>
            <Banknote /> Mark paid
          </Button>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">{s.payoutReference}</span>
        ),
    },
  ];
  return (
    <>
      <FilterBar>
        <Select
          aria-label="Status"
          className="w-40"
          value={status}
          onChange={(e) => (setStatus(e.target.value), setPage(1))}
        >
          <option value="">Any status</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
        </Select>
        {due ? (
          <span className="text-sm text-muted-foreground">
            {formatMoney(due, { whole: true })} due on this page
          </span>
        ) : null}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setRunning(true)}>
          <Play /> Run settlement
        </Button>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(s) => s.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        empty={{ title: 'No settlements' }}
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
      {paying ? <MarkPaidDialog settlement={paying} onClose={() => setPaying(null)} /> : null}
      {running ? <RunDialog onClose={() => setRunning(false)} /> : null}
    </>
  );
}

function MarkPaidDialog({
  settlement: s,
  onClose,
}: {
  settlement: AdminSettlement;
  onClose: () => void;
}) {
  const [utr, setUtr] = React.useState('');
  const pay = useApiMutation(
    () => api.post(`admin/settlements/${s.id}/mark-paid`, { payoutReference: utr.trim() }),
    { invalidate: ['admin/settlements'], success: 'Settlement marked paid', onSuccess: onClose },
  );
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={`Pay ${s.tenantName ?? 'business'} ${formatMoney(s.netPayable)}?`}
      description={`Week ${weekLabel(s)}. Record the bank transfer reference once the money has left.`}
      confirmLabel="Mark paid"
      loading={pay.isPending}
      onConfirm={() => utr.trim() && pay.mutate()}
    >
      <Field label="UTR / bank reference">
        <Input
          value={utr}
          onChange={(e) => setUtr(e.target.value)}
          placeholder="UTR123456789012"
          required
        />
      </Field>
    </ConfirmDialog>
  );
}

function RunDialog({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = React.useState(() => weekStart(1));
  const [to, setTo] = React.useState(() => weekStart(0));
  const run = useApiMutation(
    () =>
      api.post<{ created: number }>('admin/settlements/run', { periodStart: from, periodEnd: to }),
    {
      invalidate: ['admin/settlements'],
      success: (r) =>
        r.created ? `${r.created} settlements created` : 'Nothing new to settle for that period',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run settlement</DialogTitle>
          <DialogDescription>
            Groups unsettled order lines into one settlement per business. Runs automatically every
            Monday; periods already settled are skipped.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), run.mutate())}
        >
          <Field label="From (IST, inclusive)">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </Field>
          <Field label="To (IST, exclusive)">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={run.isPending}>
              Run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CommissionRules() {
  const rules = useApi<Rule[]>('admin/commission-rules');
  const [editing, setEditing] = React.useState<Rule | 'new' | null>(null);
  const toggle = useApiMutation(
    (r: Rule) => api.patch(`admin/commission-rules/${r.id}`, { isActive: !r.isActive }),
    { invalidate: ['admin/commission-rules'] },
  );
  const scope = (r: Rule) =>
    r.tenantId
      ? (r.tenantName ?? r.tenantId)
      : r.tenantType
        ? `All ${humanize(r.tenantType).toLowerCase()}s`
        : 'Platform default';
  const columns: Column<Rule>[] = [
    {
      key: 'name',
      header: 'Rule',
      cell: (r) => (
        <div>
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted-foreground">{scope(r)}</p>
        </div>
      ),
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      sortValue: (r) => Number(r.ratePct),
      cell: (r) =>
        `${Number(r.ratePct)}%${Number(r.fixedFee) ? ` + ${formatMoney(r.fixedFee)}` : ''}`,
    },
    {
      key: 'bounds',
      header: 'Min / max',
      align: 'right',
      cell: (r) =>
        `${r.minFee ? formatMoney(r.minFee) : '—'} / ${r.maxFee ? formatMoney(r.maxFee) : '—'}`,
    },
    {
      key: 'prio',
      header: 'Priority',
      align: 'right',
      sortValue: (r) => r.priority,
      cell: (r) => r.priority,
    },
    {
      key: 'from',
      header: 'Effective',
      cell: (r) =>
        `${formatDate(r.effectiveFrom)}${r.effectiveTo ? ` – ${formatDate(r.effectiveTo)}` : ''}`,
    },
    {
      key: 'active',
      header: 'Active',
      cell: (r) => (
        <Switch
          checked={r.isActive}
          onCheckedChange={() => toggle.mutate(r)}
          aria-label={`${r.isActive ? 'Disable' : 'Enable'} ${r.name}`}
        />
      ),
    },
    {
      key: 'edit',
      header: <span className="sr-only">Edit</span>,
      align: 'right',
      cell: (r) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(r)}
          aria-label={`Edit ${r.name}`}
        >
          <Pencil />
        </Button>
      ),
    },
  ];
  return (
    <>
      <FilterBar>
        <p className="text-sm text-muted-foreground">
          The most specific active rule wins: outlet, then business, then business type, then the
          platform default. Priority breaks ties.
        </p>
        <Button size="sm" className="ml-auto" onClick={() => setEditing('new')}>
          <Plus /> Add rule
        </Button>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rules.data}
        getRowId={(r) => r.id}
        loading={rules.isLoading}
      />
      {editing ? (
        <RuleDialog rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

function RuleDialog({ rule: r, onClose }: { rule: Rule | null; onClose: () => void }) {
  const [scope, setScope] = React.useState<'platform' | 'type' | 'tenant'>(
    r?.tenantId ? 'tenant' : r?.tenantType ? 'type' : 'platform',
  );
  const [f, setF] = React.useState({
    name: r?.name ?? '',
    tenantType: r?.tenantType ?? 'RESTAURANT',
    tenantId: r?.tenantId ?? '',
    ratePct: r ? String(Number(r.ratePct)) : '18',
    fixedFee: r ? String(Number(r.fixedFee)) : '0',
    minFee: r?.minFee ? String(Number(r.minFee)) : '',
    maxFee: r?.maxFee ? String(Number(r.maxFee)) : '',
    priority: String(r?.priority ?? 0),
  });
  const [search, setSearch] = React.useState('');
  const tenants = useApi<Paged<AdminTenant>>(scope === 'tenant' ? 'admin/tenants' : null, {
    q: search || undefined,
    status: 'ACTIVE',
    pageSize: 20,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const opt = (v: string) => (v.trim() ? Number(v) : undefined);
  const save = useApiMutation(
    () => {
      const body = {
        name: f.name.trim(),
        tenantType: scope === 'type' ? f.tenantType : undefined,
        tenantId: scope === 'tenant' ? f.tenantId : undefined,
        ratePct: Number(f.ratePct),
        fixedFee: opt(f.fixedFee),
        minFee: opt(f.minFee),
        maxFee: opt(f.maxFee),
        priority: Number(f.priority) || 0,
      };
      return r
        ? api.patch(`admin/commission-rules/${r.id}`, body)
        : api.post('admin/commission-rules', body);
    },
    {
      invalidate: ['admin/commission-rules'],
      success: r ? 'Rule updated' : 'Rule added; applies to new orders',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{r ? `Edit ${r.name}` : 'Add commission rule'}</DialogTitle>
          <DialogDescription>
            Commission is charged on the merchant's sales after their discounts; 18% GST on
            commission is added to the invoice.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), save.mutate())}
        >
          <Field label="Name" className="sm:col-span-2">
            <Input
              value={f.name}
              onChange={set('name')}
              required
              placeholder="e.g. Cloud kitchens launch offer"
            />
          </Field>
          <Field label="Applies to">
            <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="platform">Platform default</option>
              <option value="type">A type of business</option>
              <option value="tenant">One business</option>
            </Select>
          </Field>
          {scope === 'type' ? (
            <Field label="Business type">
              <Select value={f.tenantType} onChange={set('tenantType')}>
                {TENANT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : scope === 'tenant' ? (
            <Field label="Business">
              <Select value={f.tenantId} onChange={set('tenantId')} required>
                <option value="">Choose…</option>
                {(tenants.data?.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({humanize(t.type)})
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <span />
          )}
          {scope === 'tenant' ? (
            <Field label="Find a business" className="sm:col-span-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to search"
              />
            </Field>
          ) : null}
          <Field label="Rate (%)">
            <Input inputMode="decimal" value={f.ratePct} onChange={set('ratePct')} required />
          </Field>
          <Field label="Fixed fee per order (₹)">
            <Input inputMode="decimal" value={f.fixedFee} onChange={set('fixedFee')} />
          </Field>
          <Field label="Minimum per order (₹)">
            <Input inputMode="decimal" value={f.minFee} onChange={set('minFee')} />
          </Field>
          <Field label="Maximum per order (₹)">
            <Input inputMode="decimal" value={f.maxFee} onChange={set('maxFee')} />
          </Field>
          <Field label="Priority">
            <Input inputMode="numeric" value={f.priority} onChange={set('priority')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Save rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Payouts() {
  const [status, setStatus] = React.useState('REQUESTED');
  const [page, setPage] = React.useState(1);
  const [acting, setActing] = React.useState<{ payout: Payout; kind: 'paid' | 'failed' } | null>(
    null,
  );
  const list = useApi<Paged<Payout>>('admin/payouts', { status: status || undefined, page });
  const columns: Column<Payout>[] = [
    {
      key: 'rider',
      header: 'Rider',
      cell: (p) => <span className="font-medium">{p.ownerName ?? p.ownerId}</span>,
    },
    { key: 'amt', header: 'Amount', align: 'right', cell: (p) => formatMoney(p.amount) },
    {
      key: 'to',
      header: 'To',
      cell: (p) => (
        <span className="text-sm">
          {p.destination?.upiId ??
            (p.destination?.last4 ? `A/c ••${p.destination.last4}` : humanize(p.method))}
        </span>
      ),
    },
    { key: 'req', header: 'Requested', cell: (p) => formatDateTime(p.requestedAt) },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => <StatusBadge status={p.status} label={humanize(p.status)} />,
    },
    {
      key: 'act',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (p) =>
        p.status === 'REQUESTED' || p.status === 'PROCESSING' ? (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActing({ payout: p, kind: 'paid' })}
            >
              Paid
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActing({ payout: p, kind: 'failed' })}
            >
              Failed
            </Button>
          </div>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">
            {p.utr ?? p.failureReason}
          </span>
        ),
    },
  ];
  return (
    <>
      <FilterBar>
        <Select
          aria-label="Status"
          className="w-40"
          value={status}
          onChange={(e) => (setStatus(e.target.value), setPage(1))}
        >
          <option value="">Any status</option>
          {['REQUESTED', 'PROCESSING', 'PAID', 'FAILED'].map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
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
        empty={{ title: 'No payouts here' }}
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
      {acting ? <PayoutDialog {...acting} onClose={() => setActing(null)} /> : null}
    </>
  );
}

function PayoutDialog({
  payout: p,
  kind,
  onClose,
}: {
  payout: Payout;
  kind: 'paid' | 'failed';
  onClose: () => void;
}) {
  const [text, setText] = React.useState('');
  const act = useApiMutation(
    () =>
      api.post(
        `admin/payouts/${p.id}/mark-${kind}`,
        kind === 'paid' ? { utr: text.trim() } : { reason: text.trim() },
      ),
    {
      invalidate: ['admin/payouts'],
      success:
        kind === 'paid'
          ? 'Payout marked paid'
          : 'Payout failed; the amount is back in the rider wallet',
      onSuccess: onClose,
    },
  );
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={
        kind === 'paid'
          ? `Paid ${formatMoney(p.amount)} to ${p.ownerName ?? 'rider'}?`
          : `Mark payout to ${p.ownerName ?? 'rider'} failed?`
      }
      confirmLabel={kind === 'paid' ? 'Mark paid' : 'Mark failed'}
      destructive={kind === 'failed'}
      loading={act.isPending}
      onConfirm={() => text.trim() && act.mutate()}
    >
      <Field label={kind === 'paid' ? 'UTR' : 'Reason'}>
        <Input value={text} onChange={(e) => setText(e.target.value)} required />
      </Field>
    </ConfirmDialog>
  );
}

interface CashDue {
  walletId: string;
  ownerId: string;
  riderName: string | null;
  phone: string | null;
  cashDue: number;
  lastCollectedAt: string | null;
}

/** COD cash riders hold beyond their earnings, and recording what they hand in. */
function RiderCash() {
  const list = useApi<CashDue[]>('admin/rider-cash');
  const [depositing, setDepositing] = React.useState<CashDue | null>(null);
  const total = (list.data ?? []).reduce((a, r) => a + r.cashDue, 0);
  const columns: Column<CashDue>[] = [
    {
      key: 'rider',
      header: 'Rider',
      cell: (r) => (
        <div>
          <p className="font-medium">{r.riderName ?? r.ownerId}</p>
          <p className="text-xs text-muted-foreground">{r.phone ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Cash due',
      align: 'right',
      sortValue: (r) => r.cashDue,
      cell: (r) => <span className="font-medium tabular">{formatMoney(r.cashDue)}</span>,
    },
    {
      key: 'last',
      header: 'Last COD collected',
      cell: (r) => (r.lastCollectedAt ? formatDateTime(r.lastCollectedAt) : '—'),
    },
    {
      key: 'act',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (r) => (
        <Button size="sm" variant="outline" onClick={() => setDepositing(r)}>
          <Banknote /> Record deposit
        </Button>
      ),
    },
  ];
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        COD cash is netted against rider pay. Riders listed here hold more cash than they have
        earned
        {list.data?.length
          ? ` — ${formatMoney(total)} across ${list.data.length} rider${list.data.length === 1 ? '' : 's'}`
          : ''}
        .
      </p>
      <DataTable
        columns={columns}
        rows={list.data}
        getRowId={(r) => r.walletId}
        loading={list.isLoading}
        fetching={list.isFetching}
        empty={{
          title: 'No cash outstanding',
          description: 'Every rider has handed in their COD cash.',
        }}
      />
      {depositing ? <DepositDialog due={depositing} onClose={() => setDepositing(null)} /> : null}
    </>
  );
}

function DepositDialog({ due, onClose }: { due: CashDue; onClose: () => void }) {
  const [amount, setAmount] = React.useState(due.cashDue.toFixed(2));
  const [reference, setReference] = React.useState('');
  const value = Number(amount);
  const valid = value >= 1 && value <= due.cashDue;
  const record = useApiMutation(
    () =>
      api.post(`admin/rider-cash/${due.ownerId}/deposits`, {
        amount: value,
        reference: reference.trim() || undefined,
      }),
    { invalidate: ['admin/rider-cash'], success: 'Deposit recorded', onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cash from {due.riderName ?? 'rider'}</DialogTitle>
          <DialogDescription>
            {formatMoney(due.cashDue)} is due. The deposit is credited to the rider wallet.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => (e.preventDefault(), valid && record.mutate())}
        >
          <Field label="Amount received">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Hub receipt or deposit slip (optional)">
            <Input
              value={reference}
              maxLength={40}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={record.isPending} disabled={!valid}>
              Record {valid ? formatMoney(value) : ''}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
