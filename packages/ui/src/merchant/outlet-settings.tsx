'use client';

import * as React from 'react';
import { Copy, LocateFixed, MapPin, Plus, Store, Trash2 } from 'lucide-react';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { ConfirmDialog } from '../components/dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { PageHeader } from '../components/layout';
import { Switch } from '../components/menu';
import { Skeleton } from '../components/misc';
import { StatusBadge } from '../components/status';
import { api, uploadMedia } from '../lib/api';
import { formatRelative } from '../lib/format';
import { devicePosition } from '../lib/geo';
import { useApiMutation } from '../lib/hooks';
import { useCan } from './access';
import { useOutlet } from './outlet';
import {
  DAYS,
  hoursSummary,
  outletBody,
  outletForm,
  type HoursWindow,
  type OutletForm,
  type OutletType,
} from './outlet-form';
import type { Outlet } from './types';

/** The kind of food business the portal is serving. */
export type FoodBusinessKind = 'RESTAURANT' | 'FOOD_CART';

const STATUS_NOTE: Record<string, string> = {
  DRAFT: 'Not listed yet. Add your dishes, then submit the outlet for approval.',
  PENDING_APPROVAL:
    'FoodGrid is checking your outlet. It goes live as soon as it is approved, usually within a working day.',
  ACTIVE: 'Live: customers can find you and order while you are open.',
  PAUSED: 'Temporarily closed: hidden from new orders until you reopen.',
  SUSPENDED: 'Suspended by FoodGrid. Contact support to reopen it.',
  CLOSED: 'Closed permanently.',
};

/**
 * Outlet setup and settings for restaurants and food carts: the first outlet (with a guided
 * form), more branches for restaurants, and for each outlet its status, approval, opening
 * switch, temporary closure, location, hours, ways to order and licences.
 */
export function OutletSettings({ kind }: { kind: FoodBusinessKind }) {
  const { outlets, outlet, setOutletId, loading } = useOutlet();
  const canManage = useCan('outlet:manage');
  const [adding, setAdding] = React.useState(false);
  if (loading) return <Skeleton className="h-96" />;
  const creating = adding || !outlet;
  const noun = kind === 'FOOD_CART' ? 'cart' : 'outlet';
  return (
    <>
      <PageHeader
        title={
          creating
            ? `Set up your ${noun}`
            : kind === 'FOOD_CART'
              ? 'Cart settings'
              : 'Outlet settings'
        }
        description={
          creating
            ? `Tell customers where you are, when you're open and how they can order. You can change all of it later.`
            : `${outlet!.name} · ${hoursSummary(outlet!.openingHours)}`
        }
        actions={
          !creating && kind === 'RESTAURANT' && canManage ? (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus /> Add an outlet
            </Button>
          ) : adding && outlets.length ? (
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Back to {outlet?.name}
            </Button>
          ) : null
        }
      />
      {!canManage && creating ? (
        <p className="text-sm text-muted-foreground">
          Ask the owner or a manager to set up the outlet.
        </p>
      ) : creating ? (
        <OutletEditor
          key="new"
          kind={kind}
          onSaved={(o) => {
            setOutletId(o.id);
            setAdding(false);
          }}
        />
      ) : (
        <div className="grid gap-4">
          <OutletStatusCard outlet={outlet!} />
          <OutletEditor key={outlet!.id} kind={kind} outlet={outlet!} readOnly={!canManage} />
        </div>
      )}
    </>
  );
}

/** Where the outlet stands, and what to do next. */
function OutletStatusCard({ outlet: o }: { outlet: Outlet }) {
  const canManage = useCan('outlet:manage');
  const canOpen = useCan('orders:manage');
  const canMove = useCan('pos:operate');
  const [confirmPause, setConfirmPause] = React.useState(false);
  const dishes = o._count?.items ?? 0;
  const inv = ['merchant/outlets'];
  const submit = useApiMutation(() => api.post(`merchant/outlets/${o.id}/submit`), {
    invalidate: inv,
    success: 'Sent for approval. We will let you know when it is live',
  });
  const pause = useApiMutation(
    (paused: boolean) => api.post(`merchant/outlets/${o.id}/${paused ? 'pause' : 'resume'}`),
    {
      invalidate: inv,
      success: (r) => ((r as Outlet).status === 'PAUSED' ? 'Temporarily closed' : 'Reopened'),
      onSuccess: () => setConfirmPause(false),
    },
  );
  const move = useApiMutation(
    async () => {
      const at = await devicePosition('Allow location access to update where the cart is');
      return api.post(`merchant/outlets/${o.id}/location`, at);
    },
    { invalidate: inv, success: 'Location updated: customers nearby can find you' },
  );
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="grid gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Store className="size-4 text-muted-foreground" aria-hidden />
            {o.name}
            <StatusBadge status={o.status} />
          </CardTitle>
          <CardDescription>{STATUS_NOTE[o.status] ?? o.status}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {o.status === 'ACTIVE' && canOpen ? <OutletOpenSwitch outlet={o} /> : null}
          {o.isMobile && canMove ? (
            <Button
              variant="outline"
              size="sm"
              loading={move.isPending}
              onClick={() => move.mutate()}
            >
              <LocateFixed /> I&apos;m here now
            </Button>
          ) : null}
          {o.status === 'ACTIVE' && canManage ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmPause(true)}>
              Close temporarily
            </Button>
          ) : null}
          {o.status === 'PAUSED' && canManage ? (
            <Button size="sm" loading={pause.isPending} onClick={() => pause.mutate(false)}>
              Reopen
            </Button>
          ) : null}
        </div>
      </CardHeader>
      {o.status === 'DRAFT' ? (
        <CardContent className="grid gap-3">
          <ol className="grid gap-1.5 text-sm">
            <Step done>Outlet details, location and hours saved</Step>
            <Step done={dishes > 0}>
              {dishes > 0
                ? `${dishes} dish${dishes === 1 ? '' : 'es'} on the menu`
                : 'Add at least one dish on the Menu page'}
            </Step>
            <Step done={false}>Submit for approval</Step>
          </ol>
          {canManage ? (
            <Button
              className="justify-self-start"
              disabled={!dishes}
              loading={submit.isPending}
              onClick={() => submit.mutate()}
            >
              Submit for approval
            </Button>
          ) : null}
        </CardContent>
      ) : o.isMobile && o.lastLocationAt ? (
        <CardContent className="text-sm text-muted-foreground">
          <MapPin className="mr-1 inline size-4" aria-hidden />
          Location last updated {formatRelative(o.lastLocationAt)}
        </CardContent>
      ) : null}
      <ConfirmDialog
        open={confirmPause}
        onOpenChange={setConfirmPause}
        title={`Close ${o.name} temporarily?`}
        description="Customers can't order until you reopen it here. Orders already placed carry on."
        confirmLabel="Close temporarily"
        loading={pause.isPending}
        onConfirm={() => pause.mutate(true)}
      />
    </Card>
  );
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className={
          done
            ? 'flex size-5 items-center justify-center rounded-full bg-status-good-text text-xs text-background'
            : 'size-5 rounded-full border-2'
        }
      >
        {done ? '✓' : null}
      </span>
      <span className={done ? '' : 'text-muted-foreground'}>{children}</span>
      <span className="sr-only">{done ? '(done)' : '(to do)'}</span>
    </li>
  );
}

/**
 * Taking orders right now: the day-to-day open / closed switch of a live outlet. Without an
 * outlet argument it follows the outlet picked in the portal (for the header).
 */
export function OutletOpenSwitch({ outlet }: { outlet?: Outlet }) {
  const ctx = useOutlet();
  const canOpen = useCan('orders:manage');
  const o = outlet ?? ctx.outlet;
  const toggle = useApiMutation(
    (isOpen: boolean) => api.post(`merchant/outlets/${o!.id}/availability`, { isOpen }),
    { invalidate: ['merchant/outlets'] },
  );
  if (!o || o.status !== 'ACTIVE' || !canOpen) return null;
  const open = toggle.isPending ? !o.isOpen : o.isOpen;
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <Switch
        checked={open}
        disabled={toggle.isPending}
        onCheckedChange={(v) => toggle.mutate(v)}
        aria-label={`Taking orders at ${o.name}`}
      />
      <span className={open ? 'text-status-good-text' : 'text-muted-foreground'}>
        {open ? 'Open' : 'Closed'}
      </span>
    </label>
  );
}

function OutletEditor({
  kind,
  outlet,
  readOnly,
  onSaved,
}: {
  kind: FoodBusinessKind;
  outlet?: Outlet;
  readOnly?: boolean;
  onSaved?: (o: Outlet) => void;
}) {
  const [f, setF] = React.useState<OutletForm>(() => outletForm(outlet?.type ?? kind, outlet));
  const [error, setError] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [uploading, setUploading] = React.useState<string | null>(null);
  const set =
    <K extends keyof OutletForm>(k: K) =>
    (v: OutletForm[K]) =>
      setF((x) => ({ ...x, [k]: v }));
  const text =
    (k: keyof OutletForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));
  const cart = f.type === 'FOOD_CART';
  const save = useApiMutation(
    (body: ReturnType<typeof outletBody>) =>
      outlet
        ? api.patch<Outlet>(`merchant/outlets/${outlet.id}`, body)
        : api.post<Outlet>('merchant/outlets', body),
    {
      invalidate: ['merchant/outlets'],
      success: outlet
        ? 'Outlet settings saved'
        : 'Outlet saved. Next, add your dishes on the Menu page',
      onSuccess: (o) => onSaved?.(o),
    },
  );
  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const at = await devicePosition('Allow location access, or enter the latitude and longitude');
      setF((x) => ({ ...x, lat: at.lat.toFixed(6), lng: at.lng.toFixed(6) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  };
  const upload = async (k: 'logoUrl' | 'coverImageUrl', file?: File) => {
    if (!file) return;
    setUploading(k);
    setError(null);
    try {
      set(k)(await uploadMedia(file, 'outlets'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  };
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        try {
          save.mutate(outletBody(f, { create: !outlet }));
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <fieldset disabled={readOnly} className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {kind === 'RESTAURANT' && !outlet ? (
              <Field label="Kind of outlet" className="sm:col-span-2">
                <Select value={f.type} onChange={(e) => set('type')(e.target.value as OutletType)}>
                  <option value="RESTAURANT">
                    Restaurant, café or bakery (customers can visit)
                  </option>
                  <option value="CLOUD_KITCHEN">Cloud kitchen (delivery and pickup only)</option>
                </Select>
              </Field>
            ) : null}
            <Field label={cart ? 'Cart name' : 'Outlet name'} className="sm:col-span-2">
              <Input
                value={f.name}
                onChange={text('name')}
                required
                maxLength={120}
                placeholder={
                  cart ? 'e.g. Raju Momos, Forum Mall gate' : 'e.g. Spice Route, Indiranagar'
                }
              />
            </Field>
            <Field
              label="Cuisines"
              hint="Separate with commas; customers filter by these"
              className="sm:col-span-2"
            >
              <Input
                value={f.cuisines}
                onChange={text('cuisines')}
                placeholder="North Indian, Biryani, Chinese"
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea
                value={f.description}
                onChange={text('description')}
                rows={2}
                maxLength={1000}
                placeholder="What you're known for"
              />
            </Field>
            <Field label="Phone for customers and riders">
              <Input type="tel" value={f.phone} onChange={text('phone')} maxLength={20} />
            </Field>
            <label className="flex items-center gap-3 self-end pb-2 text-sm">
              <Switch checked={f.isPureVeg} onCheckedChange={set('isPureVeg')} />
              Pure vegetarian
            </label>
            <ImageField
              label="Logo"
              url={f.logoUrl}
              busy={uploading === 'logoUrl'}
              onFile={(file) => upload('logoUrl', file)}
              onClear={() => set('logoUrl')('')}
            />
            <ImageField
              label="Cover photo"
              url={f.coverImageUrl}
              busy={uploading === 'coverImageUrl'}
              onFile={(file) => upload('coverImageUrl', file)}
              onClear={() => set('coverImageUrl')('')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
            <CardDescription>
              {cart
                ? 'Where the cart usually stands. Use "I’m here now" on the status card when you move.'
                : 'Customers and riders are sent to this point.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Address" className="sm:col-span-2">
              <Input
                value={f.addressLine1}
                onChange={text('addressLine1')}
                required
                maxLength={200}
              />
            </Field>
            <Field label="Landmark or area (optional)" className="sm:col-span-2">
              <Input value={f.addressLine2} onChange={text('addressLine2')} maxLength={200} />
            </Field>
            <Field label="City">
              <Input value={f.city} onChange={text('city')} required maxLength={80} />
            </Field>
            <Field label="State">
              <Input value={f.state} onChange={text('state')} required maxLength={80} />
            </Field>
            <Field label="PIN code">
              <Input
                value={f.pincode}
                onChange={text('pincode')}
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
              />
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                loading={locating}
                onClick={() => void locate()}
              >
                <LocateFixed /> Use my location
              </Button>
            </div>
            <Field label="Latitude">
              <Input
                value={f.lat}
                onChange={text('lat')}
                inputMode="decimal"
                placeholder="12.9716"
              />
            </Field>
            <Field label="Longitude">
              <Input
                value={f.lng}
                onChange={text('lng')}
                inputMode="decimal"
                placeholder="77.5946"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Taking orders</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              <Toggle
                label="Delivery"
                hint="FoodGrid riders deliver"
                checked={f.acceptsDelivery}
                onChange={set('acceptsDelivery')}
              />
              <Toggle
                label="Takeaway"
                hint="Customers pick up"
                checked={f.acceptsTakeaway}
                onChange={set('acceptsTakeaway')}
              />
              {f.type !== 'CLOUD_KITCHEN' ? (
                <Toggle
                  label="Dine-in"
                  hint="Bills at the table"
                  checked={f.acceptsDineIn}
                  onChange={set('acceptsDineIn')}
                />
              ) : null}
              {f.type !== 'CLOUD_KITCHEN' ? (
                <Toggle
                  label="QR ordering"
                  hint={cart ? 'Scan the code on the cart' : 'Scan the code on the table'}
                  checked={f.acceptsQrOrders}
                  onChange={set('acceptsQrOrders')}
                />
              ) : null}
            </div>
            <Field label="Delivery radius (km)">
              <Input
                type="number"
                min={0.5}
                max={25}
                step="0.5"
                value={f.deliveryRadiusKm}
                onChange={text('deliveryRadiusKm')}
              />
            </Field>
            <Field label="Usual preparation time (min)">
              <Input
                type="number"
                min={1}
                max={180}
                value={f.avgPrepTimeMins}
                onChange={text('avgPrepTimeMins')}
              />
            </Field>
            <Field label="Cost for two (₹)" hint="Shown to customers">
              <Input type="number" min={0} value={f.costForTwo} onChange={text('costForTwo')} />
            </Field>
            <Field label="Minimum order (₹)">
              <Input
                type="number"
                min={0}
                value={f.minOrderValue}
                onChange={text('minOrderValue')}
              />
            </Field>
            <Field label="Packaging charge per order (₹)">
              <Input
                type="number"
                min={0}
                step="0.5"
                value={f.packagingCharge}
                onChange={text('packagingCharge')}
              />
            </Field>
            {!cart ? (
              <Field
                label="Kitchen stations"
                hint="Separate with commas, e.g. MAIN, TANDOOR, BAR; each gets its own kitchen screen"
              >
                <Input value={f.kdsStations} onChange={text('kdsStations')} />
              </Field>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Opening hours</CardTitle>
            <CardDescription>
              India time. A closing time before the opening time runs past midnight.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HoursEditor value={f.hours} onChange={set('hours')} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Licences</CardTitle>
            <CardDescription>
              An FSSAI licence or registration is needed to sell food. Reviewers check it before the
              outlet goes live.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="FSSAI licence number" hint="14 digits">
              <Input
                value={f.fssaiNumber}
                onChange={text('fssaiNumber')}
                inputMode="numeric"
                maxLength={14}
              />
            </Field>
            <Field label="GSTIN (if registered)">
              <Input
                value={f.gstin}
                onChange={text('gstin')}
                maxLength={15}
                className="uppercase"
              />
            </Field>
          </CardContent>
        </Card>
      </fieldset>
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical-text"
        >
          {error}
        </p>
      ) : null}
      {!readOnly ? (
        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <Button type="submit" loading={save.isPending} disabled={!!uploading}>
            {outlet ? 'Save changes' : cart ? 'Save the cart' : 'Save the outlet'}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="grid text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function ImageField({
  label,
  url,
  busy,
  onFile,
  onClear,
}: {
  label: string;
  url: string;
  busy: boolean;
  onFile: (f?: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-3">
        {url ? (
          <img src={url} alt="" className="size-14 rounded-md border object-cover" />
        ) : (
          <span className="flex size-14 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            None
          </span>
        )}
        <div className="grid gap-1">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={`Upload ${label.toLowerCase()}`}
            disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0])}
            className="max-w-56"
          />
          {url ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto justify-start p-0"
              onClick={onClear}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Opening windows per day: add, remove, edit, and copy Monday's to every day. */
function HoursEditor({
  value,
  onChange,
}: {
  value: HoursWindow[];
  onChange: (v: HoursWindow[]) => void;
}) {
  const update = (i: number, patch: Partial<HoursWindow>) =>
    onChange(value.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const add = (day: number) => {
    const last = [...value].reverse().find((w) => w.day === day);
    onChange([
      ...value,
      last ? { day, open: '18:30', close: '23:00' } : { day, open: '11:00', close: '22:00' },
    ]);
  };
  const copyMonday = () => {
    const monday = value.filter((w) => w.day === 1);
    onChange([0, 1, 2, 3, 4, 5, 6].flatMap((day) => monday.map((w) => ({ ...w, day }))));
  };
  return (
    <div className="grid gap-2">
      {[1, 2, 3, 4, 5, 6, 0].map((day) => {
        const windows = value.map((w, i) => ({ w, i })).filter(({ w }) => w.day === day);
        return (
          <div key={day} className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0">
            <span className="w-10 text-sm font-medium">{DAYS[day]}</span>
            {windows.length ? null : <span className="text-sm text-muted-foreground">Closed</span>}
            {windows.map(({ w, i }) => (
              <span key={i} className="flex items-center gap-1">
                <Input
                  type="time"
                  value={w.open}
                  onChange={(e) => update(i, { open: e.target.value })}
                  aria-label={`${DAYS[day]} opens`}
                  className="h-8 w-28"
                />
                <span aria-hidden>–</span>
                <Input
                  type="time"
                  value={w.close}
                  onChange={(e) => update(i, { close: e.target.value })}
                  aria-label={`${DAYS[day]} closes`}
                  className="h-8 w-28"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${DAYS[day]} ${w.open}–${w.close}`}
                >
                  <Trash2 />
                </Button>
              </span>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => add(day)}>
              <Plus /> {windows.length ? 'Add hours' : 'Open'}
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={copyMonday}
      >
        <Copy /> Use Monday&apos;s hours every day
      </Button>
    </div>
  );
}
