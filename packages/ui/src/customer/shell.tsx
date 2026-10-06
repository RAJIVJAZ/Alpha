'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  Crosshair,
  Home,
  LogOut,
  MapPin,
  Receipt,
  Search,
  ShoppingBag,
  User,
  Wallet,
} from 'lucide-react';
import { Button } from '../components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/menu';
import { ThemeToggle } from '../components/theme';
import { useApi, useSession } from '../lib/hooks';
import { cn } from '../lib/utils';
import { devicePosition, PlaceProvider, placeOf, useCart, usePlace } from './common';
import type { Address, Notification, Suggestions } from './types';

/** Popular delivery areas (area centres) for choosing a location without GPS or a saved address. */
export const AREAS = [
  { label: 'Koramangala, Bengaluru', lat: 12.9352, lng: 77.6245 },
  { label: 'Indiranagar, Bengaluru', lat: 12.9784, lng: 77.6408 },
  { label: 'HSR Layout, Bengaluru', lat: 12.9116, lng: 77.6474 },
  { label: 'BTM Layout, Bengaluru', lat: 12.9166, lng: 77.6101 },
  { label: 'Jayanagar, Bengaluru', lat: 12.925, lng: 77.5938 },
  { label: 'MG Road, Bengaluru', lat: 12.9756, lng: 77.605 },
  { label: 'Whitefield, Bengaluru', lat: 12.9698, lng: 77.75 },
];

/** Storefront chrome: header with location, search, cart and account; bottom tabs on phones. */
export function Storefront({ children }: { children: React.ReactNode }) {
  return (
    <PlaceProvider>
      <div className="flex min-h-dvh flex-col pb-16 md:pb-0">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">{children}</main>
        <Footer />
        <BottomTabs />
      </div>
    </PlaceProvider>
  );
}

function Header() {
  const { data: session } = useSession();
  const path = usePathname();
  // phones get a search row only where people browse; menus keep a short sticky header
  const mobileSearch = path === '/' || path.startsWith('/search');
  const cart = useCart();
  const count = (cart.data?.lines ?? []).reduce((s, l) => s + l.quantity, 0);
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="FoodGrid home">
          <span
            className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
            aria-hidden
          >
            FG
          </span>
          <span className="hidden text-lg font-semibold tracking-tight lg:inline">FoodGrid</span>
        </Link>
        <LocationButton />
        <div className="hidden flex-1 md:block">
          <SearchBox />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {session ? <NotificationBell /> : null}
          <Button asChild variant="ghost" className="relative">
            <Link href="/cart" aria-label={count ? `Cart, ${count} items` : 'Cart'}>
              <ShoppingBag />
              <span className="hidden sm:inline">Cart</span>
              {count ? (
                <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                  {count}
                </span>
              ) : null}
            </Link>
          </Button>
          {session ? (
            <AccountMenu name={session.name ?? session.phone ?? 'Account'} />
          ) : (
            <Button asChild size="sm" className="ml-1">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
          <span className="hidden lg:inline-flex">
            <ThemeToggle />
          </span>
        </div>
      </div>
      {mobileSearch ? (
        <div className="px-4 pb-3 md:hidden">
          <SearchBox />
        </div>
      ) : null}
    </header>
  );
}

function LocationButton() {
  const { place } = usePlace();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="ghost"
        className="min-w-0 flex-1 justify-start gap-1.5 px-2 md:max-w-xs md:flex-none"
        onClick={() => setOpen(true)}
        aria-label={`Delivering to ${place.label}. Change location`}
      >
        <MapPin className="text-primary" />
        <span className="truncate text-sm font-medium">{place.label}</span>
        <ChevronDown className="opacity-60" />
      </Button>
      {open ? <LocationDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function LocationDialog({ onClose }: { onClose: () => void }) {
  const { place, setPlace } = usePlace();
  const { data: session } = useSession();
  const addresses = useApi<Address[]>(session ? 'users/me/addresses' : null);
  const [error, setError] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState(false);
  const choose = (p: Parameters<typeof setPlace>[0]) => (setPlace(p), onClose());
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deliver to</DialogTitle>
          <DialogDescription>
            Restaurants and delivery times depend on where you are.
          </DialogDescription>
        </DialogHeader>
        <Button
          variant="outline"
          className="justify-start"
          loading={locating}
          onClick={() => {
            setLocating(true);
            setError(null);
            devicePosition()
              .then((p) => choose({ ...p, label: 'Current location' }))
              .catch((e: Error) => setError(e.message))
              .finally(() => setLocating(false));
          }}
        >
          <Crosshair /> Use my current location
        </Button>
        {error ? <p className="text-sm text-status-critical">{error}</p> : null}
        {addresses.data?.length ? (
          <div className="grid gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Saved addresses
            </p>
            {addresses.data.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => choose(placeOf(a))}
                className={cn(
                  'rounded-lg px-3 py-2 text-left hover:bg-muted',
                  place.addressId === a.id && 'bg-accent',
                )}
              >
                <span className="font-medium">{a.label}</span>
                <span className="block text-sm text-muted-foreground">
                  {a.line1}, {a.city} {a.pincode}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Popular areas
          </p>
          <div className="flex flex-wrap gap-2">
            {AREAS.map((a) => (
              <Button
                key={a.label}
                size="sm"
                variant={place.label === a.label ? 'default' : 'outline'}
                onClick={() => choose(a)}
              >
                {a.label.split(',')[0]}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Search with live suggestions (cuisines, restaurants, dishes); Enter searches everything. */
export function SearchBox({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const { place } = usePlace();
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const listId = React.useId();
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const s = useApi<Suggestions>(debounced.length >= 2 ? 'search/suggest' : null, {
    q: debounced,
    lat: place.lat,
    lng: place.lng,
  });
  const options = React.useMemo(() => {
    if (!s.data || debounced.length < 2) return [];
    return [
      ...s.data.outlets.map((o) => ({
        key: `o-${o.id}`,
        label: o.name,
        hint: o.type === 'FOOD_CART' ? 'Food cart' : 'Restaurant',
        href: `/r/${o.slug}`,
      })),
      ...s.data.cuisines.map((c) => ({
        key: `c-${c}`,
        label: c,
        hint: 'Cuisine',
        href: `/search?q=${encodeURIComponent(c)}`,
      })),
      ...s.data.dishes.map((d) => ({
        key: `d-${d}`,
        label: d,
        hint: 'Dish',
        href: `/search?q=${encodeURIComponent(d)}`,
      })),
    ].slice(0, 8);
  }, [s.data, debounced]);
  const go = (href: string) => (setOpen(false), setActive(-1), router.push(href));

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && options[active]) return go(options[active]!.href);
        if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-label="Search for restaurants, food carts and dishes"
        placeholder="Search for biryani, pizza, momos…"
        autoFocus={autoFocus}
        className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true), setActive(-1))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && options.length ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-11 z-40 overflow-hidden rounded-xl border bg-popover py-1 shadow-lg"
        >
          {options.map((o, i) => (
            <li key={o.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(o.href)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted',
                  i === active && 'bg-muted',
                )}
              >
                <span className="truncate">{o.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

function NotificationBell() {
  const list = useApi<{ data: Notification[] }>(
    'notifications',
    { page: 1 },
    { refetchInterval: 60_000 },
  );
  const unread = (list.data?.data ?? []).filter((n) => !n.readAt).length;
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link
        href="/notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell />
        {unread ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" aria-hidden />
        ) : null}
      </Link>
    </Button>
  );
}

function AccountMenu({ name }: { name: string }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-1.5 px-2" aria-label={`Account menu for ${name}`}>
          <User />
          <span className="hidden max-w-28 truncate sm:inline">{name.split(' ')[0]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        {[
          ['/orders', 'Orders', Receipt],
          ['/wallet', 'Wallet', Wallet],
          ['/membership', 'FoodGrid One', ShoppingBag],
          ['/subscriptions', 'Meal plans', Home],
          ['/account', 'Account & addresses', User],
        ].map(([href, label, Icon]) => {
          const I = Icon as typeof User;
          return (
            <DropdownMenuItem key={href as string} onSelect={() => router.push(href as string)}>
              <I /> {label as string}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.assign('/');
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BottomTabs() {
  const path = usePathname();
  const tabs = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/search', label: 'Search', icon: Search },
    { href: '/orders', label: 'Orders', icon: Receipt },
    { href: '/account', label: 'Account', icon: User },
  ];
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 backdrop-blur md:hidden"
    >
      {tabs.map((t) => {
        const on = t.href === '/' ? path === '/' : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[11px]',
              on ? 'font-semibold text-primary' : 'text-muted-foreground',
            )}
          >
            <t.icon className="size-5" aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-10 hidden border-t py-8 text-sm text-muted-foreground md:block">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-6">
        <p>© FoodGrid · Food from restaurants and food carts near you</p>
        <nav className="flex gap-4" aria-label="Footer">
          <Link href="/membership">FoodGrid One</Link>
          <a href="/cms/terms">Terms</a>
          <a href="/cms/privacy">Privacy</a>
        </nav>
      </div>
    </footer>
  );
}
