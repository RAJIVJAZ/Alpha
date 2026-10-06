'use client';

import * as React from 'react';
import { Clock, Minus, Plus, Star } from 'lucide-react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { ConfirmDialog } from '../components/dialog';
import { Thumb } from '../components/thumb';
import { api, ApiError } from '../lib/api';
import { formatMoney } from '../lib/format';
import { toast, useApi, useSession } from '../lib/hooks';
import { cn } from '../lib/utils';
import type { Address, Cart, OpeningHours, OutletSummary } from './types';

/* ------------------------------------------------------------------ place */

export interface Place {
  lat: number;
  lng: number;
  label: string;
  addressId?: string;
}

export const DEFAULT_PLACE: Place = { lat: 12.9352, lng: 77.6245, label: 'Koramangala, Bengaluru' };
const PLACE_KEY = 'fg.place';

const PlaceContext = React.createContext<{ place: Place; setPlace: (p: Place) => void } | null>(
  null,
);

/** Where the customer is ordering to: a saved address, the device location or the default area. */
export function PlaceProvider({ children }: { children: React.ReactNode }) {
  const [place, setPlaceState] = React.useState<Place>(DEFAULT_PLACE);
  const [chosen, setChosen] = React.useState(false);
  const { data: session } = useSession();
  const addresses = useApi<Address[]>(session && !chosen ? 'users/me/addresses' : null);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(PLACE_KEY);
      if (saved) {
        setPlaceState(JSON.parse(saved) as Place);
        setChosen(true);
      }
    } catch {
      /* private mode: keep the default */
    }
  }, []);

  // signed-in customers start from their default address
  React.useEffect(() => {
    if (chosen || !addresses.data?.length) return;
    const a = addresses.data.find((x) => x.isDefault) ?? addresses.data[0]!;
    setPlaceState(placeOf(a));
  }, [addresses.data, chosen]);

  const setPlace = React.useCallback((p: Place) => {
    setPlaceState(p);
    setChosen(true);
    try {
      localStorage.setItem(PLACE_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  return <PlaceContext.Provider value={{ place, setPlace }}>{children}</PlaceContext.Provider>;
}

export function usePlace() {
  const ctx = React.useContext(PlaceContext);
  if (!ctx) throw new Error('usePlace needs <PlaceProvider>');
  return ctx;
}

export const placeOf = (a: Address): Place => ({
  lat: a.lat,
  lng: a.lng,
  label: `${a.label} · ${a.line1}`,
  addressId: a.id,
});

/** Device position as a promise (rejects with a readable message). */
export const devicePosition = () =>
  new Promise<{ lat: number; lng: number }>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation)
      return reject(new Error('Location is not available on this device'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('Allow location access, or pick an area')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });

/* ------------------------------------------------------------------ marks */

/** FSSAI veg / non-veg mark: green square with a dot, or brown square with a triangle. */
export function VegMark({ veg, className }: { veg: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={veg ? 'Veg' : 'Non-veg'}
      title={veg ? 'Veg' : 'Non-veg'}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-card',
        veg ? 'border-[#0f8a0f]' : 'border-[#963a1e]',
        className,
      )}
    >
      {veg ? (
        <span className="size-2 rounded-full bg-[#0f8a0f]" />
      ) : (
        <span className="size-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-[#963a1e]" />
      )}
    </span>
  );
}

export function RatingPill({ value, count }: { value: number; count?: number }) {
  if (!count) return <Badge variant="neutral">New</Badge>;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium">
      <span className="inline-flex items-center gap-0.5 rounded-md bg-[#0f7a3a] px-1.5 py-0.5 text-xs text-white">
        {value.toFixed(1)}
        <Star className="size-3 fill-current" aria-hidden />
      </span>
      <span className="text-xs font-normal text-muted-foreground">
        ({count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count})
      </span>
    </span>
  );
}

/** "Opens 11:30 am" from weekly opening hours (IST), or null when unknown. */
export function nextOpening(
  hours: OpeningHours[] | null | undefined,
  now = new Date(),
): string | null {
  if (!hours?.length) return null;
  const ist = new Date(now.getTime() + 330 * 60_000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const fmt = (t: string) => {
    const h = Number(t.slice(0, 2));
    return `${h % 12 || 12}${t.slice(2, 5) === ':00' ? '' : t.slice(2, 5)} ${h < 12 ? 'am' : 'pm'}`;
  };
  for (let d = 0; d < 7; d++) {
    const day = (ist.getUTCDay() + d) % 7;
    const slots = hours.filter((h) => h.day === day).sort((a, b) => toMin(a.open) - toMin(b.open));
    const next = slots.find((s) => d > 0 || toMin(s.open) > minutes);
    if (next)
      return d === 0
        ? `Opens ${fmt(next.open)}`
        : d === 1
          ? `Opens tomorrow ${fmt(next.open)}`
          : `Opens ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]} ${fmt(next.open)}`;
  }
  return null;
}

/* ------------------------------------------------------------------ links */

/** Maps app deep links (foodgrid://...) from banners and pushes to web routes. */
export function webLink(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return url;
  const m = /^foodgrid:\/\/([^/?#]+)\/?([^?#]*)/.exec(url);
  if (!m) return /^https:\/\//.test(url) ? url : null;
  const [, kind, rest] = m;
  switch (kind) {
    case 'offers':
      return rest ? `/cart?coupon=${encodeURIComponent(rest)}` : '/cart';
    case 'outlets':
    case 'restaurants':
      return rest ? `/r/${rest}` : '/';
    case 'collections':
    case 'search':
      return `/search?q=${encodeURIComponent(rest.replace(/-/g, ' '))}`;
    case 'orders':
      return rest ? `/orders/${rest}` : '/orders';
    case 'membership':
      return '/membership';
    case 'wallet':
      return '/wallet';
    default:
      return '/';
  }
}

/** Reports a click on a sponsored placement (fire-and-forget). */
export function reportAdClick(campaignId: string | null | undefined) {
  if (!campaignId) return;
  void fetch('/api/proxy/ads/events/click', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ campaignId }),
    keepalive: true,
  }).catch(() => undefined);
}

/* ------------------------------------------------------------------ outlet card */

export function OutletCard({ outlet: o, compact }: { outlet: OutletSummary; compact?: boolean }) {
  return (
    <a
      href={`/r/${o.slug}`}
      onClick={() => (o.sponsored ? reportAdClick(o.adCampaignId) : undefined)}
      className={cn(
        'group grid gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !o.isOpen && 'opacity-60',
      )}
    >
      <div className="relative overflow-hidden rounded-xl">
        <Thumb
          src={o.coverImageUrl}
          className={cn(
            'w-full rounded-xl border-0 transition-transform group-hover:scale-[1.02]',
            compact ? 'aspect-[4/3]' : 'aspect-[16/10]',
          )}
        />
        {o.sponsored ? (
          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
            Ad
          </span>
        ) : null}
        {!o.isOpen ? (
          <span className="absolute inset-x-0 bottom-0 bg-black/65 px-3 py-1.5 text-xs font-medium text-white">
            Closed now
          </span>
        ) : null}
      </div>
      <div className="grid gap-0.5 px-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-1 font-semibold">{o.name}</p>
          <RatingPill value={o.ratingAvg} count={o.ratingCount} />
        </div>
        <p className="line-clamp-1 text-sm text-muted-foreground">
          {o.type === 'FOOD_CART' ? 'Food cart · ' : ''}
          {o.cuisines.join(', ')}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {o.etaMins} min · {o.distanceKm.toFixed(1)} km ·{' '}
          {formatMoney(o.costForTwo, { whole: true })} for two
          {o.isPureVeg ? <VegMark veg className="ml-1 size-3.5" /> : null}
        </p>
      </div>
    </a>
  );
}

export function OutletRail({
  title,
  outlets,
  hint,
}: {
  title: string;
  outlets: OutletSummary[] | undefined;
  hint?: string;
}) {
  if (!outlets?.length) return null;
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {outlets.map((o) => (
          <div key={o.id} className="w-60 shrink-0 snap-start">
            <OutletCard outlet={o} compact />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ cart */

/** Sends a signed-out customer to sign in, then back to this page. */
export function signInFirst() {
  window.location.assign(
    `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
  );
}

/** Server cart for signed-in customers (null path while signed out). */
export function useCart() {
  const { data: session } = useSession();
  return useApi<Cart>(session ? 'cart' : null);
}

export interface AddLine {
  menuItemId: string;
  quantity: number;
  variantId?: string;
  addonIds?: string[];
  notes?: string;
}

/**
 * Adds to the server cart. Switching restaurants asks first (the API answers
 * 409 CART_OUTLET_MISMATCH); signed-out customers are sent to sign in.
 */
export function useAddToCart() {
  const { data: session } = useSession();
  const [conflict, setConflict] = React.useState<{
    line: AddLine;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const cart = useCart();

  const add = React.useCallback(
    async (line: AddLine, replace = false): Promise<boolean> => {
      if (!session) {
        signInFirst();
        return false;
      }
      try {
        await api.post('cart/items', { ...line, replace: replace || undefined });
        await cart.refetch();
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.code === 'CART_OUTLET_MISMATCH') {
          const ok = await new Promise<boolean>((resolve) => setConflict({ line, resolve }));
          setConflict(null);
          return ok ? add(line, true) : false;
        }
        toast.error((e as Error).message);
        return false;
      }
    },
    [session, cart],
  );

  const dialog = conflict ? (
    <ConfirmDialog
      open
      onOpenChange={(o) => (!o ? conflict.resolve(false) : undefined)}
      title="Start a new cart?"
      description={`Your cart has items from ${cart.data?.outletName ?? 'another restaurant'}. Adding this clears it.`}
      confirmLabel="Start new cart"
      onConfirm={() => conflict.resolve(true)}
    />
  ) : null;

  return { add, dialog };
}

/** − qty + control used on menu items and cart lines. */
export function Stepper({
  value,
  onChange,
  busy,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  busy?: boolean;
  label: string;
}) {
  return (
    <div className="inline-flex h-9 items-center overflow-hidden rounded-lg border border-primary/40 bg-card text-primary">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-8 rounded-none text-primary"
        onClick={() => onChange(value - 1)}
        disabled={busy}
        aria-label={`Remove one ${label}`}
      >
        <Minus />
      </Button>
      <span className="min-w-6 text-center text-sm font-semibold tabular" aria-live="polite">
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-8 rounded-none text-primary"
        onClick={() => onChange(value + 1)}
        disabled={busy}
        aria-label={`Add one more ${label}`}
      >
        <Plus />
      </Button>
    </div>
  );
}
