'use client';

import * as React from 'react';
import {
  Camera,
  Check,
  Clock,
  MapPin,
  Navigation,
  Phone,
  Power,
  Route,
  Store,
  X,
} from 'lucide-react';
import { Button } from '../components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { EmptyState, PageHeader } from '../components/layout';
import { StatusBadge } from '../components/status';
import { api } from '../lib/api';
import { formatMoney, formatNumber, formatRelative } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { cn } from '../lib/utils';
import type { Delivery, Earnings, Offer, RiderProfile, RoutePlan } from './types';

const maps = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=two-wheeler`;

type Fix = { lat: number; lng: number; accuracyM?: number; speedKmph?: number; heading?: number };
const toFix = (p: GeolocationPosition): Fix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyM: Math.round(p.coords.accuracy),
  speedKmph: p.coords.speed ? Math.round(p.coords.speed * 3.6) : undefined,
  heading: p.coords.heading ?? undefined,
});

/** Latest fix from the background watch — a fallback when a one-off lookup is slow. */
let lastFix: { fix: Fix; at: number } | null = null;

const position = (opts: PositionOptions = {}) =>
  new Promise<Fix>((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error('Location is not available on this device'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(toFix(p)),
      () => reject(new Error('Allow location access to go online')),
      { enableHighAccuracy: true, timeout: 10_000, ...opts },
    );
  });

/** Best-effort fresh position before steps that are checked against a geofence. */
const pingNow = async () => {
  const fix = await position({ maximumAge: 15_000, timeout: 5_000 }).catch(() =>
    lastFix && Date.now() - lastFix.at < 60_000 ? lastFix.fix : null,
  );
  if (fix) await api.post('riders/me/location', fix).catch(() => undefined);
};

/** Shares the rider's position every 20 s while online so dispatch and customers see them move. */
function useLocationPings(online: boolean) {
  React.useEffect(() => {
    if (!online || !navigator.geolocation) return;
    let sent = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        lastFix = { fix: toFix(p), at: Date.now() };
        if (Date.now() - sent < 20_000) return;
        sent = Date.now();
        void api.post('riders/me/location', lastFix.fix).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);
}

/** The rider's home: go online, accept offers, work through active deliveries. */
export function RiderDuty() {
  const me = useApi<RiderProfile>('riders/me', undefined, { refetchInterval: 30_000 });
  const online = !!me.data?.isOnline;
  const offers = useApi<Offer[]>(online ? 'riders/me/offers' : null, undefined, {
    refetchInterval: 5_000,
  });
  const current = useApi<Delivery[]>('riders/me/deliveries/current', undefined, {
    refetchInterval: 10_000,
  });
  const earnings = useApi<Earnings>('riders/me/earnings');
  useLocationPings(online);

  const toggle = useApiMutation(
    async () =>
      online ? api.post('riders/me/offline') : api.post('riders/me/online', await position()),
    {
      invalidate: ['riders/me'],
      success: online ? 'You are offline' : 'You are online — offers will appear here',
    },
  );

  return (
    <>
      <PageHeader
        title={me.data ? `Hi, ${me.data.name.split(' ')[0]}` : 'Duty'}
        description={
          me.data
            ? `${me.data.rating.toFixed(1)} ★ · ${formatNumber(me.data.totalDeliveries)} deliveries`
            : undefined
        }
      />
      <Card className={cn('mb-4 border-2', online ? 'border-status-good' : 'border-transparent')}>
        <CardContent className="flex items-center justify-between gap-4 pt-5">
          <div>
            <p className="text-lg font-semibold">{online ? 'You are online' : 'You are offline'}</p>
            <p className="text-sm text-muted-foreground">
              Today {formatMoney(earnings.data?.today ?? 0, { whole: true })} ·{' '}
              {me.data?.isOnDelivery
                ? 'on a delivery'
                : online
                  ? 'waiting for offers'
                  : 'go online to receive orders'}
            </p>
          </div>
          <Button
            size="lg"
            variant={online ? 'outline' : 'default'}
            onClick={() => toggle.mutate()}
            loading={toggle.isPending}
            disabled={me.data?.status !== 'ACTIVE'}
          >
            <Power /> {online ? 'Go offline' : 'Go online'}
          </Button>
        </CardContent>
      </Card>

      {(offers.data ?? []).map((o) => (
        <OfferCard key={o.id} offer={o} />
      ))}

      {current.data?.length ? (
        <div className="grid gap-4">
          {current.data.map((d) => (
            <ActiveDelivery key={d.id} delivery={d} />
          ))}
          {current.data.length > 1 ? <RouteCard /> : null}
        </div>
      ) : (
        !offers.data?.length && (
          <EmptyState
            icon={<Clock />}
            title={online ? 'No orders right now' : 'Nothing assigned'}
            description={
              online
                ? 'Stay near busy areas — see Demand map for hotspots.'
                : 'Go online to start receiving delivery offers.'
            }
          />
        )
      )}
    </>
  );
}

function OfferCard({ offer: o }: { offer: Offer }) {
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('Too far');
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((new Date(o.expiresAt).getTime() - now) / 1000));
  const accept = useApiMutation(() => api.post(`deliveries/offers/${o.id}/accept`), {
    invalidate: ['riders/me'],
    success: `Order ${o.delivery.orderNumber} is yours — head to ${o.delivery.pickupName}`,
  });
  const reject = useApiMutation(() => api.post(`deliveries/offers/${o.id}/reject`, { reason }), {
    invalidate: ['riders/me'],
    onSuccess: () => setRejecting(false),
  });
  if (!left) return null;
  return (
    <Card className="mb-4 border-2 border-primary">
      <CardHeader className="flex-row items-start justify-between gap-3 pb-2">
        <CardTitle>New order · {formatMoney(o.estimatedEarning)}</CardTitle>
        <span
          className="flex items-center gap-1 text-sm font-semibold tabular text-primary"
          aria-live="polite"
        >
          <Clock className="size-4" aria-hidden /> {left}s
        </span>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <p className="flex gap-2">
          <Store className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="font-medium">{o.delivery.pickupName}</span> ·{' '}
            {formatNumber(o.distanceToPickupKm, { decimals: true })} km away
            <span className="block text-muted-foreground">{o.delivery.pickupAddress}</span>
          </span>
        </p>
        <p className="flex gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            {o.delivery.dropAddress}
            <span className="block text-muted-foreground">
              {formatNumber(o.delivery.distanceKm, { decimals: true })} km trip
              {o.delivery.isCod ? ` · collect ${formatMoney(o.delivery.codAmount)} cash` : ''}
            </span>
          </span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button size="lg" variant="outline" onClick={() => setRejecting(true)}>
            <X /> Reject
          </Button>
          <Button size="lg" onClick={() => accept.mutate()} loading={accept.isPending}>
            <Check /> Accept
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject this order?"
        description="Rejections lower your acceptance rate, which dispatch uses when offering orders."
        confirmLabel="Reject"
        destructive
        loading={reject.isPending}
        onConfirm={() => reject.mutate()}
      >
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {['Too far', 'Vehicle issue', 'On a break', 'Unsafe area', 'Other'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

const STEP: Record<string, { label: string; action: string; next: string }> = {
  ASSIGNED: {
    label: 'Going to the restaurant',
    action: 'arrived-pickup',
    next: "I've reached the restaurant",
  },
  AT_PICKUP: { label: 'At the restaurant', action: 'picked-up', next: 'Order picked up' },
  PICKED_UP: {
    label: 'Going to the customer',
    action: 'arrived-drop',
    next: "I've reached the customer",
  },
  AT_DROP: { label: 'At the customer', action: 'complete', next: 'Complete delivery' },
};

function ActiveDelivery({ delivery: d }: { delivery: Delivery }) {
  const [completing, setCompleting] = React.useState(false);
  const [failing, setFailing] = React.useState(false);
  const step = STEP[d.status];
  const toPickup = d.status === 'ASSIGNED' || d.status === 'AT_PICKUP';
  const advance = useApiMutation(
    async () => {
      if (step!.action.startsWith('arrived')) await pingNow();
      return api.post(`deliveries/${d.id}/${step!.action}`);
    },
    { invalidate: ['riders/me'] },
  );
  if (!step) return null;
  const phone = toPickup ? d.pickupPhone : d.dropPhone;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle>{d.orderNumber}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {step.label} · earn {formatMoney(d.riderEarning)}
            {Number(d.tipAmount) ? ` + ${formatMoney(d.tipAmount, { whole: true })} tip` : ''}
          </p>
        </div>
        <StatusBadge status={d.status} />
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="rounded-lg border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {toPickup ? 'Pick up from' : 'Deliver to'}
          </p>
          <p className="font-medium">{toPickup ? d.pickupName : (d.dropName ?? 'Customer')}</p>
          <p className="text-muted-foreground">{toPickup ? d.pickupAddress : d.dropAddress}</p>
          {d.isCod && !toPickup ? (
            <p className="mt-1 font-semibold text-primary">
              Collect {formatMoney(d.codAmount)} in cash
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline">
            <a
              href={toPickup ? maps(d.pickupLat, d.pickupLng) : maps(d.dropLat, d.dropLng)}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation /> Navigate
            </a>
          </Button>
          {phone ? (
            <Button asChild variant="outline">
              <a href={`tel:${phone}`}>
                <Phone /> Call {toPickup ? 'restaurant' : 'customer'}
              </a>
            </Button>
          ) : (
            <span />
          )}
        </div>
        <Button
          size="lg"
          onClick={() => (step.action === 'complete' ? setCompleting(true) : advance.mutate())}
          loading={advance.isPending}
        >
          {step.next}
        </Button>
        {d.status === 'AT_DROP' || d.status === 'PICKED_UP' ? (
          <Button variant="ghost" size="sm" onClick={() => setFailing(true)}>
            Can't deliver?
          </Button>
        ) : null}
      </CardContent>
      {completing ? <CompleteDialog delivery={d} onClose={() => setCompleting(false)} /> : null}
      {failing ? <FailDialog delivery={d} onClose={() => setFailing(false)} /> : null}
    </Card>
  );
}

/** Uploads a proof photo through a presigned URL and returns its public URL. */
async function uploadProof(file: File): Promise<string> {
  const p = await api.post<{
    uploadUrl: string;
    headers: Record<string, string>;
    publicUrl: string;
    maxBytes: number;
  }>('media/presign', { folder: 'delivery-proof', contentType: file.type, fileName: file.name });
  if (file.size > p.maxBytes) throw new Error('Photo is too large (max 5 MB)');
  const res = await fetch(p.uploadUrl, { method: 'PUT', headers: p.headers, body: file });
  if (!res.ok) throw new Error('Photo upload failed — try again or remove the photo');
  return p.publicUrl;
}

function CompleteDialog({ delivery: d, onClose }: { delivery: Delivery; onClose: () => void }) {
  const [otp, setOtp] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [cash, setCash] = React.useState(false);
  const done = useApiMutation(
    async () => {
      await pingNow();
      const proofPhotoUrl = file ? await uploadProof(file) : undefined;
      return api.post(`deliveries/${d.id}/complete`, {
        otp,
        proofPhotoUrl,
        codCollected: d.isCod ? cash : undefined,
      });
    },
    {
      invalidate: ['riders/me'],
      success: `Delivered! ${formatMoney(d.riderEarning)} added to your earnings`,
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete {d.orderNumber}</DialogTitle>
          <DialogDescription>
            Ask the customer for the 4-digit code in their app. You need it to complete every order;
            a photo of the handover is optional.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), done.mutate())}>
          <Field label="Delivery code">
            <Input
              inputMode="numeric"
              pattern="\d{4}"
              required
              maxLength={4}
              autoComplete="one-time-code"
              className="text-center text-2xl tracking-[0.5em]"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted">
            <Camera className="size-5" aria-hidden />
            {file ? file.name : 'Add a handover photo (optional)'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {d.isCod ? (
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={cash}
                onChange={(e) => setCash(e.target.checked)}
                required
              />
              I collected {formatMoney(d.codAmount)} in cash
            </label>
          ) : null}
          <DialogFooter>
            <Button type="submit" size="lg" loading={done.isPending} disabled={otp.length !== 4}>
              <Check /> Mark delivered
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FailDialog({ delivery: d, onClose }: { delivery: Delivery; onClose: () => void }) {
  const [reason, setReason] = React.useState('Customer not reachable');
  const [note, setNote] = React.useState('');
  const fail = useApiMutation(
    () => api.post(`deliveries/${d.id}/fail`, { reason: note ? `${reason}: ${note}` : reason }),
    {
      invalidate: ['riders/me'],
      success: 'Reported — support will contact you about the order',
      onSuccess: onClose,
    },
  );
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Report a failed delivery?"
      description="Call the customer twice and wait 10 minutes at the door before reporting."
      confirmLabel="Report"
      destructive
      loading={fail.isPending}
      onConfirm={() => fail.mutate()}
    >
      <div className="grid gap-3">
        <Field label="What happened">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {[
              'Customer not reachable',
              'Customer refused the order',
              'Wrong address',
              'Unsafe location',
              'Vehicle breakdown',
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Details">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </ConfirmDialog>
  );
}

/** Optimised order of stops when carrying more than one order. */
function RouteCard() {
  const route = useApi<RoutePlan>('riders/me/route', undefined, { refetchInterval: 30_000 });
  const r = route.data;
  if (!r?.stops.length) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Route className="size-4" aria-hidden /> Best route
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {formatNumber(r.totalKm, { decimals: true })} km · {r.totalMins} min
          {r.improvedByKm > 0
            ? ` · saves ${formatNumber(r.improvedByKm, { decimals: true })} km`
            : ''}
        </span>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ol className="grid gap-2 text-sm">
          {r.stops.map((s) => (
            <li key={s.id} className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  s.type === 'PICKUP' ? 'bg-accent text-accent-foreground' : 'bg-muted',
                )}
              >
                {s.sequence}
              </span>
              <span>
                <span className="font-medium">{s.type === 'PICKUP' ? 'Pick up' : 'Drop'}</span> ·{' '}
                {s.label}
                <span className="block text-xs text-muted-foreground">
                  +{formatNumber(s.legKm, { decimals: true })} km · arrive in ~{s.etaMins} min
                </span>
              </span>
            </li>
          ))}
        </ol>
        <Button asChild variant="outline">
          <a href={r.navigationUrl} target="_blank" rel="noreferrer">
            <Navigation /> Open full route in Maps
          </a>
        </Button>
        {route.dataUpdatedAt ? (
          <p className="text-xs text-muted-foreground">
            Updated {formatRelative(route.dataUpdatedAt)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
