'use client';

import * as React from 'react';
import { Map as MapIcon, Pencil, Search, UserPlus } from 'lucide-react';
import { Meter } from '../charts';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { DataTable, type Column } from '../components/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SheetContent,
} from '../components/dialog';
import { Field, Input, Select } from '../components/form';
import { EmptyState, FilterBar, PageHeader } from '../components/layout';
import { StatusBadge } from '../components/status';
import { Badge } from '../components/badge';
import { api } from '../lib/api';
import {
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  humanize,
} from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { PAYMENT_TERMS, type Dealer, type SellerOrder, type Territory } from './types';

const TIERS = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'] as const;
const STATUSES = ['ACTIVE', 'PROSPECT', 'INACTIVE', 'BLOCKED'] as const;

/** Wholesaler dealer network: tiers, credit limits, outstanding and dealer discounts. */
export function DealerNetwork() {
  const territories = useApi<Territory[]>('seller/territories');
  const [territoryId, setTerritoryId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [q, setQ] = React.useState('');
  const [editing, setEditing] = React.useState<Dealer | 'new' | null>(null);
  const [viewing, setViewing] = React.useState<Dealer | null>(null);
  const dealers = useApi<Dealer[]>('seller/dealers', {
    territoryId: territoryId || undefined,
    status: status || undefined,
    q: q || undefined,
  });
  const rows = dealers.data ?? [];
  const exposure = rows.reduce((s, d) => s + Number(d.outstanding), 0);

  const columns: Column<Dealer>[] = [
    {
      key: 'name',
      header: 'Dealer',
      sortValue: (d) => d.name,
      cell: (d) => (
        <div>
          <p className="font-medium">
            {d.name} {d.dealerTenantId ? <Badge variant="info">On FoodGrid</Badge> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {[d.contactName, d.phone, d.city].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    { key: 'territory', header: 'Territory', cell: (d) => d.territory?.name ?? '—' },
    {
      key: 'tier',
      header: 'Tier',
      sortValue: (d) => TIERS.indexOf(d.tier),
      cell: (d) => humanize(d.tier),
    },
    {
      key: 'terms',
      header: 'Terms',
      cell: (d) =>
        `${humanize(d.paymentTerms)}${Number(d.discountPct) ? ` · ${formatNumber(Number(d.discountPct), { decimals: true })}% off` : ''}`,
    },
    {
      key: 'credit',
      header: 'Credit used',
      sortValue: (d) => (d.creditLimit ? Number(d.outstanding) / Number(d.creditLimit) : 0),
      cell: (d) => {
        if (!d.creditLimit || !Number(d.creditLimit))
          return <span className="text-sm text-muted-foreground">No credit</span>;
        const used = Number(d.outstanding) / Number(d.creditLimit);
        return (
          <div className="w-40">
            <Meter
              value={Number(d.outstanding)}
              max={Number(d.creditLimit)}
              label={`${formatMoneyCompact(d.outstanding)} of ${formatMoneyCompact(d.creditLimit)}${used >= 0.9 ? ' · at limit' : used >= 0.7 ? ' · nearing limit' : ''}`}
              tone={used >= 0.9 ? 'critical' : used >= 0.7 ? 'warning' : 'normal'}
            />
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (d) => <StatusBadge status={d.status} label={humanize(d.status)} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (d) => (
        <div className="flex justify-end gap-1">
          {d.dealerTenantId ? (
            <Button size="sm" variant="ghost" onClick={() => setViewing(d)}>
              Orders
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(d)}
            aria-label={`Edit ${d.name}`}
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
        title="Dealer network"
        description={
          rows.length
            ? `${rows.length} dealers · ${formatMoney(exposure, { whole: true })} outstanding on credit`
            : 'Distributors and stores you supply on agreed terms'
        }
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <UserPlus /> Add dealer
          </Button>
        }
      />
      <FilterBar>
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search dealers</span>
          <Input
            className="w-56 pl-8"
            placeholder="Name or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <Select
          aria-label="Territory"
          className="w-48"
          value={territoryId}
          onChange={(e) => setTerritoryId(e.target.value)}
        >
          <option value="">All territories</option>
          {(territories.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          className="w-36"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={dealers.data}
        getRowId={(d) => d.id}
        loading={dealers.isLoading}
        fetching={dealers.isFetching}
        empty={{ title: 'No dealers match' }}
      />
      {editing ? (
        <DealerDialog
          dealer={editing === 'new' ? null : editing}
          territories={territories.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <Dialog open={!!viewing} onOpenChange={(o) => (!o ? setViewing(null) : undefined)}>
        <SheetContent side="right" className="w-full max-w-lg" aria-describedby={undefined}>
          {viewing ? <DealerOrders dealer={viewing} /> : null}
        </SheetContent>
      </Dialog>
    </>
  );
}

function DealerOrders({ dealer }: { dealer: Dealer }) {
  const orders = useApi<SellerOrder[]>(`seller/dealers/${dealer.id}/orders`);
  const total = (orders.data ?? [])
    .filter((o) => !['CANCELLED', 'REJECTED'].includes(o.status))
    .reduce((s, o) => s + Number(o.total), 0);
  return (
    <div className="grid gap-4">
      <div className="pr-8">
        <DialogTitle>{dealer.name}</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {orders.data
            ? `${orders.data.length} orders · ${formatMoney(total, { whole: true })}`
            : 'Loading…'}
        </p>
      </div>
      <ul className="divide-y text-sm">
        {(orders.data ?? []).map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 py-2">
            <span>
              <span className="font-medium">{o.orderNumber}</span>
              <span className="block text-xs text-muted-foreground">
                {formatDateTime(o.createdAt)}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular">{formatMoney(o.total)}</span>
              <StatusBadge status={o.status} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DealerDialog({
  dealer: d,
  territories,
  onClose,
}: {
  dealer: Dealer | null;
  territories: Territory[];
  onClose: () => void;
}) {
  const [f, setF] = React.useState({
    name: d?.name ?? '',
    contactName: d?.contactName ?? '',
    phone: d?.phone ?? '+91',
    email: d?.email ?? '',
    gstin: d?.gstin ?? '',
    address: d?.address ?? '',
    city: d?.city ?? '',
    territoryId: d?.territoryId ?? territories[0]?.id ?? '',
    tier: d?.tier ?? 'BRONZE',
    status: d?.status ?? 'PROSPECT',
    creditLimit: d?.creditLimit ? String(Number(d.creditLimit)) : '',
    paymentTerms: d?.paymentTerms ?? 'PREPAID',
    discountPct: d ? String(Number(d.discountPct)) : '0',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const save = useApiMutation(
    () => {
      const body = {
        name: f.name.trim(),
        contactName: f.contactName || undefined,
        phone: f.phone.trim(),
        email: f.email || undefined,
        gstin: f.gstin ? f.gstin.toUpperCase() : undefined,
        address: f.address || undefined,
        city: f.city.trim(),
        territoryId: f.territoryId || undefined,
        tier: f.tier,
        status: f.status,
        creditLimit: f.creditLimit ? Number(f.creditLimit) : undefined,
        paymentTerms: f.paymentTerms,
        discountPct: Number(f.discountPct) || 0,
      };
      return d ? api.patch(`seller/dealers/${d.id}`, body) : api.post('seller/dealers', body);
    },
    {
      invalidate: ['seller/dealers', 'seller/territories'],
      success: d ? 'Dealer updated' : 'Dealer added',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{d ? `Edit ${d.name}` : 'Add dealer'}</DialogTitle>
          <DialogDescription>
            Credit terms and the dealer discount apply when the dealer orders on FoodGrid.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), save.mutate())}
        >
          <Field label="Business name">
            <Input value={f.name} onChange={set('name')} required />
          </Field>
          <Field label="Contact person">
            <Input value={f.contactName} onChange={set('contactName')} />
          </Field>
          <Field label="Phone">
            <Input value={f.phone} onChange={set('phone')} inputMode="tel" required />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="GSTIN">
            <Input value={f.gstin} onChange={set('gstin')} maxLength={15} />
          </Field>
          <Field label="City">
            <Input value={f.city} onChange={set('city')} required />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={f.address} onChange={set('address')} />
          </Field>
          <Field label="Territory">
            <Select value={f.territoryId} onChange={set('territoryId')}>
              <option value="">None</option>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tier">
            <Select value={f.tier} onChange={set('tier')}>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment terms">
            <Select value={f.paymentTerms} onChange={set('paymentTerms')}>
              {PAYMENT_TERMS.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Credit limit (₹)">
            <Input
              inputMode="decimal"
              value={f.creditLimit}
              onChange={set('creditLimit')}
              placeholder="No credit"
            />
          </Field>
          <Field label="Dealer discount (%)">
            <Input inputMode="decimal" value={f.discountPct} onChange={set('discountPct')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Save dealer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Sales territories with month-to-date sales against target. */
export function Territories() {
  const list = useApi<Territory[]>('seller/territories');
  const [editing, setEditing] = React.useState<Territory | 'new' | null>(null);
  return (
    <>
      <PageHeader
        title="Territories"
        description="Month-to-date delivered sales, by dealer or delivery pincode"
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <MapIcon /> Add territory
          </Button>
        }
      />
      {list.data && !list.data.length ? (
        <EmptyState
          icon={<MapIcon />}
          title="No territories yet"
          description="Group pincodes into territories to set targets and assign dealers."
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(list.data ?? []).map((t) => {
          const target = Number(t.monthlyTarget ?? 0);
          return (
            <Card key={t.id} className={t.isActive ? undefined : 'opacity-60'}>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle>
                    {t.name}{' '}
                    {t.code ? (
                      <span className="text-sm font-normal text-muted-foreground">{t.code}</span>
                    ) : null}
                  </CardTitle>
                  <CardDescription>
                    {t._count?.dealers ?? 0} dealers · {t.pincodes.length} pincodes
                    {t.isActive ? '' : ' · inactive'}
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(t)}
                  aria-label={`Edit ${t.name}`}
                >
                  <Pencil />
                </Button>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-2xl font-semibold tabular">
                  {formatMoney(t.monthToDateSales, { whole: true })}
                </p>
                {target ? (
                  <Meter
                    value={t.monthToDateSales}
                    max={target}
                    label={`of ${formatMoneyCompact(target)} monthly target`}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No monthly target set</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t.pincodes.join(', ') || 'No pincodes'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {editing ? (
        <TerritoryDialog
          territory={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function TerritoryDialog({
  territory: t,
  onClose,
}: {
  territory: Territory | null;
  onClose: () => void;
}) {
  const [f, setF] = React.useState({
    name: t?.name ?? '',
    code: t?.code ?? '',
    cities: t?.cities.join(', ') ?? '',
    pincodes: t?.pincodes.join(', ') ?? '',
    monthlyTarget: t?.monthlyTarget ? String(Number(t.monthlyTarget)) : '',
    isActive: t?.isActive ?? true,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const list = (s: string) =>
    s
      .split(/[,\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  const save = useApiMutation(
    () => {
      const body = {
        name: f.name.trim(),
        code: f.code || undefined,
        cities: list(f.cities),
        pincodes: list(f.pincodes).flatMap((p) => p.split(/\s+/)),
        monthlyTarget: f.monthlyTarget ? Number(f.monthlyTarget) : undefined,
        isActive: f.isActive,
      };
      return t
        ? api.patch(`seller/territories/${t.id}`, body)
        : api.post('seller/territories', body);
    },
    {
      invalidate: ['seller/territories'],
      success: t ? 'Territory updated' : 'Territory added',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t ? `Edit ${t.name}` : 'Add territory'}</DialogTitle>
          <DialogDescription>
            Orders delivered to these pincodes count towards the territory.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), save.mutate())}
        >
          <Field label="Name">
            <Input value={f.name} onChange={set('name')} required />
          </Field>
          <Field label="Code">
            <Input value={f.code} onChange={set('code')} placeholder="BLR-N" />
          </Field>
          <Field label="Cities" className="sm:col-span-2">
            <Input value={f.cities} onChange={set('cities')} placeholder="Bengaluru" />
          </Field>
          <Field label="Pincodes" hint="Separate with commas or spaces" className="sm:col-span-2">
            <Input value={f.pincodes} onChange={set('pincodes')} />
          </Field>
          <Field label="Monthly target (₹)">
            <Input inputMode="decimal" value={f.monthlyTarget} onChange={set('monthlyTarget')} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={f.isActive}
              onChange={(e) => setF({ ...f, isActive: e.target.checked })}
              className="accent-[var(--primary)]"
            />
            Active
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Save territory
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
