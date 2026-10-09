'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Button } from '../components/button';
import { Select } from '../components/form';
import { EmptyState, ErrorNotice } from '../components/layout';
import { Skeleton } from '../components/misc';
import { Thumb } from '../components/thumb';
import { api, type Paged } from '../lib/api';
import { formatMoney, formatRelative } from '../lib/format';
import { toast, useApi, useSession } from '../lib/hooks';
import { cn } from '../lib/utils';
import { OutletCard, OutletRail, reportAdClick, usePlace, VegMark, webLink } from './common';
import type { Banner, HomeFeed, OutletSummary, SearchResult } from './types';

/* ------------------------------------------------------------------ home */

export function HomeView() {
  const { place } = usePlace();
  const { data: session } = useSession();
  const feed = useApi<HomeFeed>('recommendations/home', { lat: place.lat, lng: place.lng });
  const banners = useApi<Banner[]>('cms/banners', { city: 'Bengaluru', audience: 'CUSTOMER' });
  const f = feed.data;
  const hero = (banners.data ?? []).filter((b) => b.placement === 'HOME_HERO');
  const strip = (banners.data ?? []).filter((b) => b.placement !== 'HOME_HERO');
  // late at night only a few places are open; skip a rail that repeats one already shown
  const title = session ? 'Recommended for you' : 'Popular near you';
  const reason = f?.recommended[0]?.reasons?.[0];
  const seen = new Set<string>();
  const rails = [
    { title, hint: reason && reason !== title ? reason : undefined, outlets: f?.recommended },
    { title: 'Top rated', hint: undefined, outlets: f?.topRated },
    { title: 'Fastest delivery', hint: undefined, outlets: f?.fastDelivery },
  ].filter((r) => {
    const key = (r.outlets ?? []).map((o) => o.id).join();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <div className="grid grid-cols-1 gap-8">
      {hero.length || strip.length ? <BannerRow banners={[...hero, ...strip]} /> : null}
      {session && f?.reorder.length ? <ReorderRail items={f.reorder} /> : null}
      {feed.error ? <ErrorNotice error={feed.error} /> : null}
      {rails.map((r) => (
        <OutletRail key={r.title} title={r.title} hint={r.hint} outlets={r.outlets} />
      ))}
      <AllOutlets />
    </div>
  );
}

function BannerRow({ banners }: { banners: Banner[] }) {
  return (
    <section
      aria-label="Offers"
      className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      {banners.map((b, i) => {
        const href = webLink(b.linkUrl) ?? '/';
        return (
          <Link
            key={b.id}
            href={href}
            className={cn(
              'relative flex h-36 w-[85%] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl p-5 text-white sm:w-[26rem]',
              // brand-tinted gradients behind the creative so text stays readable when images are slow or missing
              [
                'bg-gradient-to-br from-orange-600 to-rose-700',
                'bg-gradient-to-br from-emerald-700 to-teal-900',
                'bg-gradient-to-br from-indigo-700 to-slate-900',
              ][i % 3],
            )}
          >
            {b.imageUrl ? (
              <img
                src={b.imageUrl}
                alt=""
                className="absolute inset-0 size-full object-cover opacity-40"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            ) : null}
            <span className="relative text-xl font-semibold leading-tight">{b.title}</span>
            {b.subtitle ? <span className="relative text-sm opacity-90">{b.subtitle}</span> : null}
          </Link>
        );
      })}
    </section>
  );
}

function ReorderRail({ items }: { items: HomeFeed['reorder'] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const reorder = async (orderId: string) => {
    setBusy(orderId);
    try {
      const r = await api.post<{ added: number; skipped: string[] }>(`orders/${orderId}/reorder`);
      if (r?.skipped?.length)
        toast.info(
          `${r.skipped.join(', ')} ${r.skipped.length === 1 ? 'is' : 'are'} unavailable right now`,
        );
      router.push('/cart');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">Order again</h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {items.map((r) => (
          <div
            key={r.orderId}
            className="flex w-72 shrink-0 snap-start gap-3 rounded-xl border bg-card p-3"
          >
            <Thumb src={r.imageUrl} className="size-16" />
            <div className="grid min-w-0 flex-1 gap-1">
              <Link href={`/r/${r.slug}`} className="truncate font-medium hover:underline">
                {r.outletName}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{r.items.join(', ')}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatMoney(r.total, { whole: true })} · {formatRelative(r.lastAt)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === r.orderId}
                  onClick={() => reorder(r.orderId)}
                >
                  <RotateCcw /> Reorder
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const SORTS = [
  ['relevance', 'Relevance'],
  ['distance', 'Distance'],
  ['eta', 'Delivery time'],
  ['rating', 'Rating'],
  ['cost_low', 'Cost: low to high'],
  ['cost_high', 'Cost: high to low'],
] as const;

function AllOutlets() {
  const { place } = usePlace();
  const [type, setType] = React.useState('');
  const [veg, setVeg] = React.useState(false);
  const [rated, setRated] = React.useState(false);
  const [openNow, setOpenNow] = React.useState(false);
  const [sort, setSort] = React.useState('relevance');
  const [pages, setPages] = React.useState(1);
  const filters = {
    lat: place.lat,
    lng: place.lng,
    type: type || undefined,
    veg: veg || undefined,
    minRating: rated ? 4 : undefined,
    openNow: openNow || undefined,
    sort,
    pageSize: 12 * pages,
  };
  const list = useApi<Paged<OutletSummary>>('outlets/nearby', filters);
  const chip = (on: boolean, label: string, toggle: () => void) => (
    <Button
      size="sm"
      variant={on ? 'default' : 'outline'}
      className="rounded-full"
      aria-pressed={on}
      onClick={() => (toggle(), setPages(1))}
    >
      {label}
    </Button>
  );
  const rows = list.data?.data ?? [];
  return (
    <section className="grid grid-cols-1 gap-4" aria-labelledby="all-outlets">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="all-outlets" className="text-lg font-semibold">
            Restaurants and food carts near you
          </h2>
          {list.data ? (
            <p className="text-sm text-muted-foreground">
              {list.data.meta.total} places deliver to {place.label}
            </p>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">Sort by</span>
          <Select
            className="h-8 w-44"
            value={sort}
            onChange={(e) => (setSort(e.target.value), setPages(1))}
          >
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {chip(type === 'RESTAURANT', 'Restaurants', () =>
          setType(type === 'RESTAURANT' ? '' : 'RESTAURANT'),
        )}
        {chip(type === 'FOOD_CART', 'Food carts', () =>
          setType(type === 'FOOD_CART' ? '' : 'FOOD_CART'),
        )}
        {chip(veg, 'Pure veg', () => setVeg(!veg))}
        {chip(rated, 'Rated 4.0+', () => setRated(!rated))}
        {chip(openNow, 'Open now', () => setOpenNow(!openNow))}
      </div>
      {list.isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[16/10] rounded-xl" />
          ))}
        </div>
      ) : rows.length ? (
        <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((o) => (
            <OutletCard key={o.id} outlet={o} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing matches these filters"
          description={`Try removing a filter, or pick another area than ${place.label}.`}
        />
      )}
      {list.data && rows.length < list.data.meta.total ? (
        <Button
          variant="outline"
          className="justify-self-center"
          loading={list.isFetching}
          onClick={() => setPages(pages + 1)}
        >
          Show more
        </Button>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ search */

export function SearchView() {
  const params = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const { place } = usePlace();
  const [type, setType] = React.useState<'all' | 'outlets' | 'dishes'>('all');
  const res = useApi<SearchResult>(q ? 'search' : null, { q, lat: place.lat, lng: place.lng });
  const r = res.data;
  return (
    <div className="grid grid-cols-1 gap-5">
      {!q ? (
        <EmptyState
          title="Search FoodGrid"
          description="Find restaurants, food carts and dishes that deliver to you."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Results for “{q}”</h1>
            <div className="flex gap-2" role="group" aria-label="Show">
              {(['all', 'outlets', 'dishes'] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  className="rounded-full"
                  variant={type === t ? 'default' : 'outline'}
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                >
                  {t === 'all' ? 'All' : t === 'outlets' ? 'Restaurants' : 'Dishes'}
                </Button>
              ))}
            </div>
          </div>
          {res.error ? <ErrorNotice error={res.error} /> : null}
          {res.isLoading ? <Skeleton className="h-40" /> : null}
          {r && !r.outlets.length && !r.dishes.length ? (
            <EmptyState
              title={`No matches for “${q}”`}
              description="Check the spelling, or try a cuisine like “South Indian”."
            />
          ) : null}
          {r && type !== 'dishes' && r.outlets.length ? (
            <section className="grid gap-3">
              <h2 className="font-semibold">Restaurants and food carts</h2>
              <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {r.outlets.map((o) => (
                  <OutletCard key={o.id} outlet={o} />
                ))}
              </div>
            </section>
          ) : null}
          {r && type !== 'outlets' && r.dishes.length ? (
            <section className="grid gap-3">
              <h2 className="font-semibold">Dishes</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {r.dishes.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/r/${d.outlet.slug}#item-${d.id}`}
                      onClick={() =>
                        d.outlet.sponsored
                          ? reportAdClick(d.outlet.adCampaignId, d.outlet.adClickToken)
                          : undefined
                      }
                      className={cn(
                        'flex gap-3 rounded-xl border bg-card p-3 hover:bg-muted/50',
                        !d.outlet.isOpenNow && 'opacity-60',
                      )}
                    >
                      <Thumb src={d.imageUrl} className="size-20" />
                      <span className="grid min-w-0 content-start gap-1">
                        <span className="flex items-center gap-2 font-medium">
                          <VegMark veg={d.isVeg} />
                          <span className="truncate">{d.name}</span>
                        </span>
                        <span className="text-sm">{formatMoney(d.price, { whole: true })}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {d.outlet.name} · {d.outlet.etaMins} min
                          {d.outlet.isOpenNow ? '' : ' · closed now'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ cms */

/** Minimal, injection-safe markdown: headings, bullet lists and paragraphs. */
function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="ml-5 list-disc space-y-1">
          {list.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^[-*] /.test(line)) {
      list.push(line.slice(2));
      continue;
    }
    flush();
    if (!line) continue;
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) {
      const Tag = (['h1', 'h2', 'h3'] as const)[h[1]!.length - 1]!;
      blocks.push(
        <Tag
          key={blocks.length}
          className={cn(
            'font-semibold',
            Tag === 'h1' ? 'text-2xl' : Tag === 'h2' ? 'mt-4 text-lg' : 'mt-3',
          )}
        >
          {h[2]}
        </Tag>,
      );
    } else blocks.push(<p key={blocks.length}>{line}</p>);
  }
  flush();
  return <div className="grid gap-3 leading-relaxed">{blocks}</div>;
}

export function CmsPageView({ slug }: { slug: string }) {
  const page = useApi<{ title: string; body: string; publishedAt: string | null }>(
    `cms/pages/${slug}`,
  );
  if (page.error) return <EmptyState title="Page not found" description="It may have moved." />;
  if (!page.data) return <Skeleton className="h-64" />;
  return (
    <article className="mx-auto max-w-2xl">
      <Markdown text={page.data.body} />
    </article>
  );
}
