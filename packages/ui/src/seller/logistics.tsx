'use client';

import * as React from 'react';
import { MapPinned, Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
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
import { EmptyState, PageHeader } from '../components/layout';
import { Switch } from '../components/menu';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import type { DeliverySlot, DeliveryZone } from './types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Where the seller delivers (pincodes or a radius), at what charge and lead time. */
export function DeliveryZones() {
  const zones = useApi<DeliveryZone[]>('seller/delivery-zones');
  const [editing, setEditing] = React.useState<DeliveryZone | 'new' | null>(null);
  const [removing, setRemoving] = React.useState<DeliveryZone | null>(null);
  const toggle = useApiMutation(
    (z: DeliveryZone) => api.patch(`seller/delivery-zones/${z.id}`, { isActive: !z.isActive }),
    { invalidate: ['seller/delivery-zones'] },
  );
  const remove = useApiMutation((id: string) => api.delete(`seller/delivery-zones/${id}`), {
    invalidate: ['seller/delivery-zones'],
    success: 'Zone removed',
    onSuccess: () => setRemoving(null),
  });

  const columns: Column<DeliveryZone>[] = [
    { key: 'name', header: 'Zone', cell: (z) => <span className="font-medium">{z.name}</span> },
    {
      key: 'area',
      header: 'Coverage',
      cell: (z) =>
        z.radiusKm ? (
          <span className="text-sm">{z.radiusKm} km radius</span>
        ) : (
          <span className="text-sm" title={z.pincodes.join(', ')}>
            {z.pincodes.length} pincodes
            {z.pincodes.length
              ? ` (${z.pincodes.slice(0, 3).join(', ')}${z.pincodes.length > 3 ? '…' : ''})`
              : ''}
          </span>
        ),
    },
    {
      key: 'charge',
      header: 'Delivery charge',
      align: 'right',
      cell: (z) => formatMoney(z.deliveryCharge, { whole: true }),
    },
    {
      key: 'free',
      header: 'Free above',
      align: 'right',
      cell: (z) => (z.freeDeliveryAbove ? formatMoney(z.freeDeliveryAbove, { whole: true }) : '—'),
    },
    {
      key: 'min',
      header: 'Min. order',
      align: 'right',
      cell: (z) => (z.minOrderValue ? formatMoney(z.minOrderValue, { whole: true }) : '—'),
    },
    { key: 'lead', header: 'Lead time', align: 'right', cell: (z) => `${z.leadTimeHours} h` },
    {
      key: 'active',
      header: 'Active',
      cell: (z) => (
        <Switch
          checked={z.isActive}
          onCheckedChange={() => toggle.mutate(z)}
          aria-label={`${z.isActive ? 'Pause' : 'Activate'} ${z.name}`}
        />
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (z) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(z)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRemoving(z)}
            aria-label={`Remove ${z.name}`}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Delivery zones"
        description="Buyers outside every active zone can't order from you"
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> Add zone
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={zones.data}
        getRowId={(z) => z.id}
        loading={zones.isLoading}
        empty={{
          title: 'No delivery zones',
          description: 'Add the pincodes or radius you deliver to.',
          icon: <MapPinned />,
        }}
      />
      {editing ? (
        <ZoneDialog zone={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => (!o ? setRemoving(null) : undefined)}
        title={`Remove ${removing?.name}?`}
        description="Buyers in this zone will no longer see your products."
        confirmLabel="Remove zone"
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </>
  );
}

function ZoneDialog({ zone: z, onClose }: { zone: DeliveryZone | null; onClose: () => void }) {
  const [mode, setMode] = React.useState<'pincodes' | 'radius'>(
    z?.radiusKm ? 'radius' : 'pincodes',
  );
  const [f, setF] = React.useState({
    name: z?.name ?? '',
    pincodes: z?.pincodes.join(', ') ?? '',
    centerLat: z?.centerLat?.toString() ?? '',
    centerLng: z?.centerLng?.toString() ?? '',
    radiusKm: z?.radiusKm?.toString() ?? '10',
    deliveryCharge: z ? String(Number(z.deliveryCharge)) : '100',
    freeDeliveryAbove: z?.freeDeliveryAbove ? String(Number(z.freeDeliveryAbove)) : '',
    minOrderValue: z?.minOrderValue ? String(Number(z.minOrderValue)) : '',
    leadTimeHours: String(z?.leadTimeHours ?? 24),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const opt = (v: string) => (v.trim() ? Number(v) : undefined);
  const save = useApiMutation(
    () => {
      const body = {
        name: f.name.trim(),
        ...(mode === 'pincodes'
          ? {
              pincodes: f.pincodes.split(/[\s,]+/).filter(Boolean),
              radiusKm: z?.radiusKm ? null : undefined,
            }
          : {
              pincodes: [],
              centerLat: Number(f.centerLat),
              centerLng: Number(f.centerLng),
              radiusKm: Number(f.radiusKm),
            }),
        deliveryCharge: Number(f.deliveryCharge),
        freeDeliveryAbove: opt(f.freeDeliveryAbove),
        minOrderValue: opt(f.minOrderValue),
        leadTimeHours: Number(f.leadTimeHours),
      };
      return z
        ? api.patch(`seller/delivery-zones/${z.id}`, body)
        : api.post('seller/delivery-zones', body);
    },
    {
      invalidate: ['seller/delivery-zones'],
      success: z ? 'Zone updated' : 'Zone added',
      onSuccess: onClose,
    },
  );
  const useMyLocation = () =>
    navigator.geolocation?.getCurrentPosition((p) =>
      setF((cur) => ({
        ...cur,
        centerLat: p.coords.latitude.toFixed(5),
        centerLng: p.coords.longitude.toFixed(5),
      })),
    );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{z ? `Edit ${z.name}` : 'Add delivery zone'}</DialogTitle>
          <DialogDescription>
            Charges are before GST; freight is billed with 18% GST.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), save.mutate())}
        >
          <Field label="Name" className="sm:col-span-2">
            <Input value={f.name} onChange={set('name')} required />
          </Field>
          <Field label="Coverage" className="sm:col-span-2">
            <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="pincodes">List of pincodes</option>
              <option value="radius">Radius around a point</option>
            </Select>
          </Field>
          {mode === 'pincodes' ? (
            <Field label="Pincodes" hint="Separate with commas or spaces" className="sm:col-span-2">
              <Input
                value={f.pincodes}
                onChange={set('pincodes')}
                placeholder="560001, 560034"
                required
              />
            </Field>
          ) : (
            <>
              <Field label="Latitude">
                <Input
                  inputMode="decimal"
                  value={f.centerLat}
                  onChange={set('centerLat')}
                  required
                />
              </Field>
              <Field label="Longitude">
                <Input
                  inputMode="decimal"
                  value={f.centerLng}
                  onChange={set('centerLng')}
                  required
                />
              </Field>
              <Field label="Radius (km)">
                <Input inputMode="decimal" value={f.radiusKm} onChange={set('radiusKm')} required />
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
                  Use my location
                </Button>
              </div>
            </>
          )}
          <Field label="Delivery charge (₹)">
            <Input
              inputMode="decimal"
              value={f.deliveryCharge}
              onChange={set('deliveryCharge')}
              required
            />
          </Field>
          <Field label="Free delivery above (₹)">
            <Input
              inputMode="decimal"
              value={f.freeDeliveryAbove}
              onChange={set('freeDeliveryAbove')}
            />
          </Field>
          <Field label="Minimum order (₹)">
            <Input inputMode="decimal" value={f.minOrderValue} onChange={set('minOrderValue')} />
          </Field>
          <Field label="Lead time (hours)">
            <Input
              inputMode="numeric"
              value={f.leadTimeHours}
              onChange={set('leadTimeHours')}
              required
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Save zone
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Weekly delivery slots buyers can book (retailers and distributors). */
export function DeliverySlots() {
  const slots = useApi<DeliverySlot[]>('seller/delivery-slots');
  const [adding, setAdding] = React.useState(false);
  const toggle = useApiMutation(
    (s: DeliverySlot) => api.patch(`seller/delivery-slots/${s.id}`, { isActive: !s.isActive }),
    { invalidate: ['seller/delivery-slots'] },
  );
  const byDay = DAYS.map((_, d) => (slots.data ?? []).filter((s) => s.dayOfWeek === d));
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <>
      <PageHeader
        title="Delivery slots"
        description="Buyers pick a slot at checkout; orders close at the cut-off before each slot"
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add slot
          </Button>
        }
      />
      {slots.data && !slots.data.length ? (
        <EmptyState
          title="No delivery slots"
          description="Add weekly slots so buyers can choose when to receive goods."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {order.map((d) => (
            <Card key={d}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{DAYS[d]}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {byDay[d]!.length ? (
                  byDay[d]!.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-medium tabular">
                          {s.startTime}–{s.endTime}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {s.label ? `${s.label} · ` : ''}
                          {s.capacity} orders · cut-off {s.cutoffMinutes} min
                        </span>
                      </span>
                      <Switch
                        checked={s.isActive}
                        onCheckedChange={() => toggle.mutate(s)}
                        aria-label={`${s.isActive ? 'Disable' : 'Enable'} ${DAYS[d]} ${s.startTime} slot`}
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No slots</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {adding ? <SlotDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function SlotDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = React.useState({
    label: 'Morning',
    days: [1, 2, 3, 4, 5, 6] as number[],
    startTime: '07:00',
    endTime: '10:00',
    capacity: '20',
    cutoffMinutes: '120',
  });
  const save = useApiMutation(
    () =>
      Promise.all(
        f.days.map((dayOfWeek) =>
          api.post('seller/delivery-slots', {
            label: f.label || undefined,
            dayOfWeek,
            startTime: f.startTime,
            endTime: f.endTime,
            capacity: Number(f.capacity),
            cutoffMinutes: Number(f.cutoffMinutes),
          }),
        ),
      ),
    {
      invalidate: ['seller/delivery-slots'],
      success: (r) => `${r.length} slot${r.length > 1 ? 's' : ''} added`,
      onSuccess: onClose,
    },
  );
  const toggleDay = (d: number) =>
    setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] });
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add delivery slot</DialogTitle>
          <DialogDescription>Creates the slot on each selected day.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), save.mutate())}
        >
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Days</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <label
                  key={d}
                  className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={f.days.includes(d)}
                    onChange={() => toggleDay(d)}
                    className="accent-[var(--primary)]"
                  />
                  {DAYS[d]!.slice(0, 3)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Label">
            <Input
              value={f.label}
              onChange={(e) => setF({ ...f, label: e.target.value })}
              maxLength={40}
            />
          </Field>
          <Field label="Orders per slot">
            <Input
              inputMode="numeric"
              value={f.capacity}
              onChange={(e) => setF({ ...f, capacity: e.target.value })}
              required
            />
          </Field>
          <Field label="Starts">
            <Input
              type="time"
              value={f.startTime}
              onChange={(e) => setF({ ...f, startTime: e.target.value })}
              required
            />
          </Field>
          <Field label="Ends">
            <Input
              type="time"
              value={f.endTime}
              onChange={(e) => setF({ ...f, endTime: e.target.value })}
              required
            />
          </Field>
          <Field label="Order cut-off (minutes before)">
            <Input
              inputMode="numeric"
              value={f.cutoffMinutes}
              onChange={(e) => setF({ ...f, cutoffMinutes: e.target.value })}
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending} disabled={!f.days.length}>
              Add slot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
