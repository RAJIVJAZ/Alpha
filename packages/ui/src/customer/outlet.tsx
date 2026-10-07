'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Flame, MapPin, Search, Star, Ticket } from 'lucide-react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Textarea } from '../components/form';
import { EmptyState, ErrorNotice } from '../components/layout';
import { Tabs, TabsContent, TabsList, TabsTrigger, Switch } from '../components/menu';
import { Skeleton } from '../components/misc';
import { Thumb } from '../components/thumb';
import { api, type Paged } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { toast, useApi, useSession } from '../lib/hooks';
import { cn } from '../lib/utils';
import {
  nextOpening,
  RatingPill,
  signInFirst,
  Stepper,
  useAddToCart,
  useCart,
  usePlace,
  VegMark,
  type AddLine,
} from './common';
import { SubscribeDialog } from './account';
import type { Cart, Coupon, Menu, MenuItem, OutletDetail, Review, SubscriptionPlan } from './types';

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

const unitPrice = (item: MenuItem, variantId?: string, addonIds: string[] = []) =>
  Number(item.price) +
  Number(item.variants.find((v) => v.id === variantId)?.priceDelta ?? 0) +
  item.addonGroups
    .flatMap((g) => g.addons)
    .filter((a) => addonIds.includes(a.id))
    .reduce((s, a) => s + Number(a.price), 0);

const customisable = (i: MenuItem) =>
  i.variants.length > 1 || i.addonGroups.some((g) => g.addons.length);

/** Restaurant / food cart page: menu, offers, reviews, meal plans and info. */
export function OutletView({ slug }: { slug: string }) {
  const menu = useApi<Menu>(`outlets/${slug}/menu`);
  const plans = useApi<SubscriptionPlan[]>(
    menu.data ? `outlets/${menu.data.outlet.id}/subscription-plans` : null,
  );
  if (menu.error)
    return (
      <EmptyState
        title="We couldn't find this place"
        description="It may have closed on FoodGrid."
        action={
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    );
  if (!menu.data)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    );
  const o = menu.data.outlet;
  const activePlans = plans.data ?? [];
  return (
    <div className="grid grid-cols-1 gap-5">
      <OutletHeader outlet={o} />
      <Tabs defaultValue="menu">
        <TabsList>
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          {activePlans.length ? <TabsTrigger value="plans">Meal plans</TabsTrigger> : null}
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>
        <TabsContent value="menu">
          <MenuBrowser menu={menu.data} />
        </TabsContent>
        <TabsContent value="reviews">
          <Reviews outletId={o.id} rating={o.ratingAvg} count={o.ratingCount} />
        </TabsContent>
        {activePlans.length ? (
          <TabsContent value="plans">
            <MealPlans plans={activePlans} outlet={o} />
          </TabsContent>
        ) : null}
        <TabsContent value="info">
          <OutletInfo outlet={o} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OutletHeader({ outlet: o }: { outlet: OutletDetail }) {
  const { place } = usePlace();
  const { data: session } = useSession();
  const coupons = useApi<Coupon[]>(session ? 'coupons' : null, { outletId: o.id });
  const distance = km(place, o);
  // a paused kitchen (switch off) has no reopening time; only outside-hours closures do
  const opens = o.isOpen && !o.isOpenNow ? nextOpening(o.openingHours) : null;
  const offers = (coupons.data ?? []).filter((c) => c.eligible);
  return (
    <section className="grid grid-cols-1 gap-4">
      <div className="relative overflow-hidden rounded-2xl">
        <Thumb
          src={o.coverImageUrl}
          className="aspect-[3/1] w-full rounded-2xl border-0 sm:aspect-[4/1]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{o.name}</h1>
            <p className="truncate text-sm opacity-90">
              {o.type === 'FOOD_CART' ? 'Food cart · ' : ''}
              {o.cuisines.join(', ')}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-foreground">
            <RatingPill value={o.ratingAvg} count={o.ratingCount} />
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="size-4" aria-hidden />
          {o.addressLine2 ?? o.city} · {distance.toFixed(1)} km away
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-4" aria-hidden />
          Ready in ~{o.avgPrepTimeMins} min
        </span>
        <span>{formatMoney(o.costForTwo, { whole: true })} for two</span>
        {o.isPureVeg ? (
          <span className="flex items-center gap-1">
            <VegMark veg /> Pure veg
          </span>
        ) : null}
        {o.isMobile ? (
          <Badge variant="info">Moves around — live location shown at checkout</Badge>
        ) : null}
      </div>
      {!o.isOpenNow ? (
        <p
          role="status"
          className="rounded-xl border border-status-warning/40 bg-status-warning/15 px-4 py-3 text-sm"
        >
          <span className="font-medium">
            {o.isOpen ? 'Closed now.' : 'Not taking orders right now.'}
          </span>{' '}
          {opens ? `${opens}. ` : ''}You can browse the menu; ordering opens when the kitchen does.
        </p>
      ) : null}
      {offers.length ? (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Offers">
          {offers.map((c) => (
            <div
              key={c.code}
              className="flex min-w-60 shrink-0 items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-accent px-3 py-2"
            >
              <Ticket className="size-5 text-primary" aria-hidden />
              <span className="grid">
                <span className="text-sm font-semibold">{c.title}</span>
                <span className="text-xs text-muted-foreground">
                  Use {c.code}
                  {Number(c.minOrderValue)
                    ? ` · above ${formatMoney(c.minOrderValue, { whole: true })}`
                    : ''}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MenuBrowser({ menu }: { menu: Menu }) {
  const o = menu.outlet;
  const { data: session } = useSession();
  const cart = useCart();
  const { add, dialog } = useAddToCart();
  const [vegOnly, setVegOnly] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [customising, setCustomising] = React.useState<MenuItem | null>(null);
  const mine = cart.data?.outletId === o.id ? cart.data : null;
  const needle = q.trim().toLowerCase();
  const show = (i: MenuItem) =>
    (!vegOnly || i.isVeg) &&
    (!needle ||
      i.name.toLowerCase().includes(needle) ||
      (i.description ?? '').toLowerCase().includes(needle));
  const categories = menu.categories
    .map((c) => ({ ...c, items: c.items.filter(show) }))
    .filter((c) => c.items.length);
  const recommended = menu.recommended.filter(show);
  const pairs = useApi<MenuItem[]>(mine?.lines.length ? 'recommendations/dishes' : null, {
    outletId: o.id,
    itemIds: mine?.lines.map((l) => l.menuItemId),
  });
  const inCart = new Set(mine?.lines.map((l) => l.menuItemId));
  const goesWell = (pairs.data ?? []).filter((i) => !inCart.has(i.id) && i.isAvailable).slice(0, 4);

  const onAdd = (item: MenuItem) => {
    if (!session) return signInFirst();
    if (customisable(item)) return setCustomising(item);
    void add({
      menuItemId: item.id,
      quantity: 1,
      variantId: item.variants.find((v) => v.isDefault)?.id,
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search this menu</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search in ${o.name.split(' - ')[0]}`}
            className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        {!o.isPureVeg ? (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={vegOnly} onCheckedChange={setVegOnly} aria-label="Veg only" />
            <VegMark veg /> Veg only
          </label>
        ) : null}
      </div>
      <nav
        aria-label="Menu sections"
        className="sticky top-16 z-20 -mx-4 flex gap-2 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0"
      >
        {recommended.length ? (
          <a
            href="#recommended"
            className="shrink-0 rounded-full border px-3 py-1 text-sm hover:bg-muted"
          >
            Recommended
          </a>
        ) : null}
        {categories.map((c) => (
          <a
            key={c.id}
            href={`#cat-${c.id}`}
            className="shrink-0 rounded-full border px-3 py-1 text-sm hover:bg-muted"
          >
            {c.name} <span className="text-muted-foreground">{c.items.length}</span>
          </a>
        ))}
      </nav>
      {goesWell.length ? (
        <section aria-labelledby="goes-well" className="grid gap-2 rounded-xl border bg-card p-4">
          <h2 id="goes-well" className="font-semibold">
            Goes well with your order
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {goesWell.map((i) => (
              <div key={i.id} className="flex items-center gap-3">
                <Thumb src={i.imageUrl} className="size-12" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <VegMark veg={i.isVeg} className="size-3.5" />
                    <span className="truncate">{i.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(i.price, { whole: true })}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!o.isOpenNow}
                  onClick={() => onAdd(i)}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {recommended.length ? (
        <section id="recommended" className="scroll-mt-32 grid gap-3">
          <h2 className="text-lg font-semibold">Recommended</h2>
          <div className="divide-y rounded-xl border bg-card px-4">
            {recommended.map((i) => (
              <ItemRow key={`r-${i.id}`} item={i} cart={mine} open={o.isOpenNow} onAdd={onAdd} />
            ))}
          </div>
        </section>
      ) : null}
      {categories.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-32 grid gap-3">
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <div className="divide-y rounded-xl border bg-card px-4">
            {c.items.map((i) => (
              <ItemRow key={i.id} item={i} cart={mine} open={o.isOpenNow} onAdd={onAdd} />
            ))}
          </div>
        </section>
      ))}
      {!categories.length && !recommended.length ? (
        <EmptyState title="No dishes match" description="Clear the search or the veg filter." />
      ) : null}
      {customising ? (
        <CustomiseDialog
          item={customising}
          onClose={() => setCustomising(null)}
          onAdd={(line) => add(line).then((ok) => (ok ? setCustomising(null) : undefined))}
        />
      ) : null}
      {dialog}
      <CartBar cart={mine} />
    </div>
  );
}

function ItemRow({
  item: i,
  cart,
  open,
  onAdd,
}: {
  item: MenuItem;
  cart: Cart | null;
  open: boolean;
  onAdd: (i: MenuItem) => void;
}) {
  const lines = (cart?.lines ?? []).filter((l) => l.menuItemId === i.id);
  const qty = lines.reduce((s, l) => s + l.quantity, 0);
  const cartQ = useCart();
  const [busy, setBusy] = React.useState(false);
  const change = async (n: number) => {
    if (n > qty) return onAdd(i);
    if (lines.length > 1)
      return toast.info(
        'This dish has different customisations in your cart — change them from the cart.',
      );
    const line = lines[0]!;
    setBusy(true);
    try {
      if (n <= 0) await api.delete(`cart/items/${line.lineId}`);
      else await api.patch(`cart/items/${line.lineId}`, { quantity: n });
      await cartQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      id={`item-${i.id}`}
      className={cn('flex scroll-mt-32 gap-4 py-4', !i.isAvailable && 'opacity-55')}
    >
      <div className="grid min-w-0 flex-1 content-start gap-1">
        <div className="flex items-center gap-2">
          <VegMark veg={i.isVeg} />
          {i.tags.includes('bestseller') ? (
            <span className="flex items-center gap-0.5 text-xs font-medium text-primary">
              <Star className="size-3 fill-current" aria-hidden /> Bestseller
            </span>
          ) : null}
          {i.spiceLevel && i.spiceLevel >= 2 ? (
            <span
              className="flex items-center text-xs text-muted-foreground"
              aria-label={`Spice level ${i.spiceLevel} of 3`}
            >
              {Array.from({ length: i.spiceLevel }, (_, k) => (
                <Flame key={k} className="size-3" aria-hidden />
              ))}
            </span>
          ) : null}
        </div>
        <h3 className="font-semibold">{i.name}</h3>
        <p className="text-sm">
          {formatMoney(i.price, { whole: true })}
          {i.compareAtPrice && Number(i.compareAtPrice) > Number(i.price) ? (
            <s className="ml-2 text-muted-foreground">
              {formatMoney(i.compareAtPrice, { whole: true })}
            </s>
          ) : null}
          {customisable(i) ? (
            <span className="ml-2 text-xs text-muted-foreground">Customisable</span>
          ) : null}
        </p>
        {i.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{i.description}</p>
        ) : null}
      </div>
      <div className="relative flex w-28 shrink-0 flex-col items-center sm:w-32">
        <Thumb src={i.imageUrl} className="aspect-square w-full rounded-xl" />
        <div className="relative z-10 -mt-5">
          {!i.isAvailable ? (
            <span className="rounded-lg border bg-card px-3 py-1.5 text-xs font-medium">
              Sold out
            </span>
          ) : qty ? (
            <Stepper value={qty} onChange={change} busy={busy || !open} label={i.name} />
          ) : (
            <Button
              variant="outline"
              className="h-9 w-24 border-primary/40 bg-card font-semibold text-primary shadow-sm hover:bg-accent"
              disabled={!open}
              onClick={() => onAdd(i)}
              aria-label={`Add ${i.name}`}
            >
              ADD
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomiseDialog({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (line: AddLine) => Promise<unknown>;
}) {
  const variants = item.variants.filter((v) => v.isAvailable);
  const [variantId, setVariantId] = React.useState(
    variants.find((v) => v.isDefault)?.id ?? variants[0]?.id,
  );
  const [addonIds, setAddonIds] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState('');
  const [qty, setQty] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const missing = item.addonGroups.filter(
    (g) => g.addons.filter((a) => addonIds.includes(a.id)).length < g.minSelect,
  );
  const toggle = (groupId: string, id: string) => {
    const g = item.addonGroups.find((x) => x.id === groupId)!;
    const inGroup = addonIds.filter((a) => g.addons.some((x) => x.id === a));
    if (addonIds.includes(id)) return setAddonIds(addonIds.filter((a) => a !== id));
    if (g.maxSelect === 1)
      return setAddonIds([...addonIds.filter((a) => !inGroup.includes(a)), id]);
    if (inGroup.length >= g.maxSelect) return;
    setAddonIds([...addonIds, id]);
  };
  const total = unitPrice(item, variantId, addonIds) * qty;
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <VegMark veg={item.isVeg} /> {item.name}
          </DialogTitle>
          <DialogDescription>{item.description ?? 'Make it yours'}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (missing.length) return;
            setBusy(true);
            await onAdd({
              menuItemId: item.id,
              quantity: qty,
              variantId,
              addonIds,
              notes: notes.trim() || undefined,
            });
            setBusy(false);
          }}
        >
          {variants.length > 1 ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-semibold">Size</legend>
              {variants.map((v) => (
                <label
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="variant"
                      className="accent-[var(--primary)]"
                      checked={variantId === v.id}
                      onChange={() => setVariantId(v.id)}
                    />
                    {v.name}
                  </span>
                  <span className="tabular text-muted-foreground">
                    {formatMoney(Number(item.price) + Number(v.priceDelta), { whole: true })}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {item.addonGroups.map((g) => {
            const picked = g.addons.filter((a) => addonIds.includes(a.id)).length;
            return (
              <fieldset key={g.id} className="grid gap-2">
                <legend className="mb-1 text-sm font-semibold">
                  {g.name}{' '}
                  <span className="font-normal text-muted-foreground">
                    {g.minSelect
                      ? `pick ${g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}–${g.maxSelect}`}`
                      : `up to ${g.maxSelect}`}
                  </span>
                </legend>
                {g.addons.map((a) => {
                  const on = addonIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm',
                        on && 'border-primary bg-accent',
                        !a.isAvailable && 'opacity-50',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="accent-[var(--primary)]"
                          checked={on}
                          disabled={
                            !a.isAvailable || (!on && g.maxSelect > 1 && picked >= g.maxSelect)
                          }
                          onChange={() => toggle(g.id, a.id)}
                        />
                        <VegMark veg={a.isVeg} className="size-3.5" />
                        {a.name}
                      </span>
                      <span className="tabular text-muted-foreground">
                        +{formatMoney(a.price, { whole: true })}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            );
          })}
          <Field label="Note for the kitchen (optional)">
            <Textarea
              rows={2}
              maxLength={200}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Less spicy, no onion…"
            />
          </Field>
          <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
            <Stepper
              value={qty}
              onChange={(n) => setQty(Math.max(1, Math.min(20, n)))}
              label={item.name}
            />
            <Button
              type="submit"
              loading={busy}
              disabled={missing.length > 0}
              className="flex-1 sm:flex-none"
            >
              {missing.length
                ? `Choose ${missing[0]!.name.toLowerCase()}`
                : `Add · ${formatMoney(total, { whole: true })}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CartBar({ cart }: { cart: Cart | null }) {
  if (!cart?.lines.length) return null;
  const count = cart.lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = cart.lines.reduce((s, l) => s + Number(l.totalPrice), 0);
  return (
    <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:bottom-4">
      <Link
        href="/cart"
        className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl bg-primary px-5 py-3 text-primary-foreground shadow-lg"
      >
        <span className="text-sm font-medium">
          {count} item{count === 1 ? '' : 's'} · {formatMoney(subtotal, { whole: true })}
          <span className="block text-xs opacity-85">Taxes and delivery added at checkout</span>
        </span>
        <span className="flex items-center gap-1 font-semibold">
          View cart <ArrowRight className="size-4" aria-hidden />
        </span>
      </Link>
    </div>
  );
}

function Reviews({ outletId, rating, count }: { outletId: string; rating: number; count: number }) {
  const [page, setPage] = React.useState(1);
  const list = useApi<Paged<Review>>(`outlets/${outletId}/reviews`, { page, pageSize: 10 });
  return (
    <div className="grid gap-4">
      <p className="flex items-center gap-3">
        <span className="text-3xl font-semibold tabular">{rating.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground">from {count} ratings</span>
      </p>
      {list.error ? <ErrorNotice error={list.error} /> : null}
      <ul className="grid grid-cols-1 gap-3">
        {(list.data?.data ?? []).map((r) => (
          <li key={r.id} className="grid grid-cols-1 gap-1.5 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <RatingPill value={r.rating} count={1} />
              <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
            </div>
            {r.comment ? <p className="text-sm">{r.comment}</p> : null}
            {r.tags.length ? (
              <div className="flex flex-wrap gap-1">
                {r.tags.map((t) => (
                  <Badge key={t} variant="neutral">
                    {t.replace(/-/g, ' ')}
                  </Badge>
                ))}
              </div>
            ) : null}
            {r.reply ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="font-medium">Reply from the restaurant: </span>
                {r.reply}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {list.data && !list.data.data.length ? <EmptyState title="No reviews yet" /> : null}
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

const SLOT_LABEL: Record<string, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACKS: 'Snacks',
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function MealPlans({ plans, outlet }: { plans: SubscriptionPlan[]; outlet: OutletDetail }) {
  const [picked, setPicked] = React.useState<SubscriptionPlan | null>(null);
  const { data: session } = useSession();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {plans.map((p) => (
        <div key={p.id} className="grid gap-2 rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold">{p.name}</h3>
            <VegMark veg={p.isVeg} />
          </div>
          <p className="text-sm text-muted-foreground">{p.description}</p>
          <p className="text-sm">
            {SLOT_LABEL[p.slot] ?? p.slot} · {p.daysOfWeek.map((d) => DAYS[d]).join(', ')} ·{' '}
            {formatMoney(p.pricePerMeal, { whole: true })} a meal
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-lg font-semibold tabular">
              {formatMoney(p.totalPrice, { whole: true })}
            </span>
            <Button onClick={() => (session ? setPicked(p) : signInFirst())}>Subscribe</Button>
          </div>
        </div>
      ))}
      {picked ? (
        <SubscribeDialog plan={picked} outletName={outlet.name} onClose={() => setPicked(null)} />
      ) : null}
    </div>
  );
}

function OutletInfo({ outlet: o }: { outlet: OutletDetail }) {
  const byDay = (o.openingHours ?? []).reduce<Record<number, string[]>>(
    (m, h) => ({ ...m, [h.day]: [...(m[h.day] ?? []), `${h.open}–${h.close}`] }),
    {},
  );
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="font-semibold">Address</dt>
        <dd className="text-muted-foreground">
          {o.addressLine1}
          {o.addressLine2 ? `, ${o.addressLine2}` : ''}, {o.city} {o.pincode}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Opening hours</dt>
        <dd className="grid text-muted-foreground">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <span key={d}>
              {DAYS[d]}: {byDay[d]?.join(', ') ?? 'Closed'}
            </span>
          ))}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Ordering</dt>
        <dd className="text-muted-foreground">
          {[
            o.acceptsDelivery && 'Delivery',
            o.acceptsTakeaway && 'Takeaway',
            o.acceptsQrOrders && 'Table QR ordering',
          ]
            .filter(Boolean)
            .join(' · ')}
          {Number(o.minOrderValue)
            ? ` · minimum order ${formatMoney(o.minOrderValue, { whole: true })}`
            : ''}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Licences</dt>
        <dd className="text-muted-foreground">
          {o.fssaiNumber ? `FSSAI ${o.fssaiNumber}` : ''}
          {o.gstin ? ` · GSTIN ${o.gstin}` : ''}
        </dd>
      </div>
    </dl>
  );
}

export { CustomiseDialog, ItemRow, unitPrice, customisable };
