'use client';

import * as React from 'react';
import { Pencil } from 'lucide-react';
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
} from '../components/dialog';
import { Field, Input } from '../components/form';
import { api } from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';

/** A delivery pricing version (delivery-service GET admin/delivery-pricing). */
export interface DeliveryPricingVersion {
  id: string;
  version: number;
  customerFlatFee: number;
  freeDeliveryAbove: number | null;
  riderPerKm: number;
  riderMinPayout: number;
  waitingThresholdMins: number;
  waitingPay: number;
  arrivalRadiusM: number;
  cancellationPay: number;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

const rs = (n: number) => formatMoney(n, { whole: Number.isInteger(n) });

/** delivery-service riderPayout without surge: max(minimum, per-km × km to 0.1 km). */
export function examplePayout(
  v: Pick<DeliveryPricingVersion, 'riderPerKm' | 'riderMinPayout'>,
  km: number,
) {
  const payable = Math.round(km * 10 + 1e-9) / 10;
  return Math.max(v.riderMinPayout, Math.round(payable * v.riderPerKm * 100) / 100);
}

const feeRule = (v: DeliveryPricingVersion) =>
  v.freeDeliveryAbove == null
    ? `${rs(v.customerFlatFee)} on every order`
    : `${rs(v.customerFlatFee)} below ${rs(v.freeDeliveryAbove)} of food, free from it`;
const payRule = (v: DeliveryPricingVersion) =>
  `Greater of ${rs(v.riderMinPayout)} and ${rs(v.riderPerKm)} a km`;
const waitRule = (v: DeliveryPricingVersion) =>
  `${rs(v.waitingPay)} once, after ${v.waitingThresholdMins} min within ${v.arrivalRadiusM} m`;
const who = (v: DeliveryPricingVersion) => (v.createdBy === 'system' ? 'System' : v.createdBy);

/**
 * Delivery pricing: what customers pay for delivery and how riders are paid. A change adds a
 * new version, used by new quotes and deliveries; deliveries already under way keep theirs.
 */
export function DeliveryPricing() {
  const data = useApi<{ current: DeliveryPricingVersion; history: DeliveryPricingVersion[] }>(
    'admin/delivery-pricing',
  );
  const [editing, setEditing] = React.useState(false);
  const v = data.data?.current;
  const columns: Column<DeliveryPricingVersion>[] = [
    { key: 'v', header: 'Version', sortValue: (r) => r.version, cell: (r) => `v${r.version}` },
    { key: 'fee', header: 'Customer fee', cell: feeRule },
    { key: 'pay', header: 'Rider pay', cell: payRule },
    { key: 'wait', header: 'Waiting pay', cell: waitRule },
    {
      key: 'cancel',
      header: 'Cancellation pay',
      align: 'right',
      cell: (r) => rs(r.cancellationPay),
    },
    {
      key: 'by',
      header: 'Changed',
      cell: (r) => (
        <div>
          <p>{formatDateTime(r.createdAt)}</p>
          <p className="text-xs text-muted-foreground">
            {who(r)}
            {r.note ? ` · ${r.note}` : ''}
          </p>
        </div>
      ),
    },
  ];
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="grid gap-1.5">
            <CardTitle>{v ? `In force: version ${v.version}` : 'Delivery pricing'}</CardTitle>
            <CardDescription>
              Changes apply to new quotes and deliveries within a minute; deliveries already under
              way keep the version they started with.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing(true)} disabled={!v}>
            <Pencil /> Change
          </Button>
        </CardHeader>
        {v ? (
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Rule term="Customer delivery fee">{feeRule(v)}. Surge never changes it.</Rule>
              <Rule term="Rider pay per delivered order">
                {payRule(v)} from pickup to drop (to 0.1 km), plus surge while the zone surges. 1 km
                pays {rs(examplePayout(v, 1))}, 3 km {rs(examplePayout(v, 3))}, 5 km{' '}
                {rs(examplePayout(v, 5))}.
              </Rule>
              <Rule term="Waiting pay">
                {rs(v.waitingPay)}, once per delivery, when the rider waits more than{' '}
                {v.waitingThresholdMins} minutes at the pickup after a GPS-confirmed arrival (within{' '}
                {v.arrivalRadiusM} m).
              </Rule>
              <Rule term="Cancelled or failed after the rider reached the pickup">
                {v.cancellationPay > 0
                  ? `${rs(v.cancellationPay)} cancellation pay, plus any waiting pay.`
                  : 'Waiting pay only (no cancellation pay is set).'}
              </Rule>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Set {formatDateTime(v.createdAt)} by {who(v)}
              {v.note ? `: ${v.note}` : ''}
            </p>
          </CardContent>
        ) : null}
      </Card>
      <DataTable
        columns={columns}
        rows={data.data?.history}
        getRowId={(r) => r.id}
        loading={data.isLoading}
      />
      {editing && v ? <PricingDialog current={v} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

function Rule({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="font-medium">{term}</dt>
      <dd className="text-muted-foreground">{children}</dd>
    </div>
  );
}

function PricingDialog({
  current: c,
  onClose,
}: {
  current: DeliveryPricingVersion;
  onClose: () => void;
}) {
  const [f, setF] = React.useState({
    customerFlatFee: String(c.customerFlatFee),
    freeDeliveryAbove: c.freeDeliveryAbove == null ? '' : String(c.freeDeliveryAbove),
    riderPerKm: String(c.riderPerKm),
    riderMinPayout: String(c.riderMinPayout),
    waitingThresholdMins: String(c.waitingThresholdMins),
    waitingPay: String(c.waitingPay),
    arrivalRadiusM: String(c.arrivalRadiusM),
    cancellationPay: String(c.cancellationPay),
    note: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const preview = {
    riderPerKm: Number(f.riderPerKm) || 0,
    riderMinPayout: Number(f.riderMinPayout) || 0,
  };
  const save = useApiMutation(
    () =>
      api.post('admin/delivery-pricing', {
        // refused if someone changed pricing since this dialog opened
        baseVersion: c.version,
        customerFlatFee: Number(f.customerFlatFee),
        freeDeliveryAbove: f.freeDeliveryAbove.trim() ? Number(f.freeDeliveryAbove) : null,
        riderPerKm: Number(f.riderPerKm),
        riderMinPayout: Number(f.riderMinPayout),
        waitingThresholdMins: Number(f.waitingThresholdMins),
        waitingPay: Number(f.waitingPay),
        arrivalRadiusM: Number(f.arrivalRadiusM),
        cancellationPay: Number(f.cancellationPay),
        note: f.note.trim() || undefined,
      }),
    {
      invalidate: ['admin/delivery-pricing'],
      success: 'New pricing saved; new orders use it within a minute',
      onSuccess: onClose,
    },
  );
  const money = {
    type: 'number',
    inputMode: 'decimal',
    min: 0,
    step: '0.01',
    required: true,
  } as const;
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Change delivery pricing</DialogTitle>
          <DialogDescription>
            Saved as version {c.version + 1} with your name in the audit log. Version {c.version}{' '}
            stays in the history.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), save.mutate())}
        >
          <Field label="Delivery fee (₹)">
            <Input {...money} value={f.customerFlatFee} onChange={set('customerFlatFee')} />
          </Field>
          <Field label="Free from a food subtotal of (₹)" hint="Leave empty to never waive it">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={f.freeDeliveryAbove}
              onChange={set('freeDeliveryAbove')}
            />
          </Field>
          <Field label="Rider pay per km (₹)">
            <Input {...money} value={f.riderPerKm} onChange={set('riderPerKm')} />
          </Field>
          <Field
            label="Minimum pay per delivery (₹)"
            hint={`1 km pays ${rs(examplePayout(preview, 1))}, 5 km ${rs(examplePayout(preview, 5))}`}
          >
            <Input {...money} value={f.riderMinPayout} onChange={set('riderMinPayout')} />
          </Field>
          <Field label="Waiting pay (₹, once)">
            <Input {...money} value={f.waitingPay} onChange={set('waitingPay')} />
          </Field>
          <Field label="After waiting more than (min)">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              required
              value={f.waitingThresholdMins}
              onChange={set('waitingThresholdMins')}
            />
          </Field>
          <Field label="Arrival counts within (m)" hint="Distance from the pickup, by GPS">
            <Input
              type="number"
              inputMode="numeric"
              min={50}
              max={1000}
              required
              value={f.arrivalRadiusM}
              onChange={set('arrivalRadiusM')}
            />
          </Field>
          <Field
            label="Cancellation pay (₹)"
            hint="When cancelled or failed after the rider reached the pickup"
          >
            <Input {...money} value={f.cancellationPay} onChange={set('cancellationPay')} />
          </Field>
          <Field label="Reason for the change" className="sm:col-span-2">
            <Input
              value={f.note}
              onChange={set('note')}
              maxLength={200}
              placeholder="e.g. Monsoon week: minimum pay up to ₹40"
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save version {c.version + 1}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
