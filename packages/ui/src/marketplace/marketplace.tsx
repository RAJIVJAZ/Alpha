'use client';

import * as React from 'react';
import { Minus, Plus, Search, ShoppingCart, Star, Trash2 } from 'lucide-react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
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
import { Field, Input, Select, Textarea } from '../components/form';
import { EmptyState, FilterBar, PageHeader } from '../components/layout';
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/menu';
import { Spinner } from '../components/misc';
import { StatusBadge } from '../components/status';
import { Thumb } from '../components/thumb';
import { api, newIdempotencyKey, type Paged } from '../lib/api';
import { formatMoney, formatNumber, formatPercent, humanize, istDate } from '../lib/format';
import { toast, useApi, useApiMutation, useSession } from '../lib/hooks';
import { useCan } from '../merchant/access';
import {
  PAYMENT_TERMS,
  type BuyerSegment,
  type MarketplaceCategory,
  type SellerOrder,
} from '../seller/types';
import {
  bySeller,
  cartTotals,
  nextQty,
  putLine,
  qtyError,
  removeLine,
  segmentFor,
  unitPrice,
  type CartLine,
  type MarketProduct,
} from './cart';
import { BuyerOrders } from './orders';

const n = (v: string | number | null | undefined) =>
  formatNumber(Number(v ?? 0), { decimals: true });
const pack = (p: Pick<MarketProduct, 'packSize' | 'unit'>) =>
  `${n(p.packSize)} ${p.unit.toLowerCase()}`;
const leadTime = (h: number) => (h < 24 ? `${h} h` : `${n(h / 24)} d`);

/** B2B marketplace for buyers: browse, a cart per seller, checkout with a delivery slot, orders. */
export function Marketplace() {
  const { data: session } = useSession();
  const me = session?.memberships.find((m) => m.tenantId === session.activeTenantId);
  const segment = segmentFor(me?.tenantType);
  const canBuy = useCan('procurement:manage');
  const canSeeOrders = useCan('procurement:read');
  const [tab, setTab] = React.useState('browse');
  // shortcut: the cart lives in page state and empties on reload, persist it if buyers ask
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [productId, setProductId] = React.useState<string | null>(null);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [checkoutSeller, setCheckoutSeller] = React.useState<string | null>(null);
  const put = (p: MarketProduct, quantity: number) => {
    setLines((l) => putLine(l, p, quantity));
    toast.success(`${p.name} × ${n(quantity)} in your cart`);
  };
  const checkoutGroup = bySeller(lines).find((g) => g.sellerId === checkoutSeller);

  return (
    <>
      <PageHeader
        title="Marketplace"
        description="Buy from suppliers, wholesalers and retailers: bulk prices, MOQ, delivery slots"
        actions={
          canBuy ? (
            <Button size="sm" variant="outline" onClick={() => setCartOpen(true)}>
              <ShoppingCart /> Cart{lines.length ? ` (${lines.length})` : ''}
            </Button>
          ) : null
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-3">
          <TabsTrigger value="browse">Browse</TabsTrigger>
          {canSeeOrders ? <TabsTrigger value="orders">My orders</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="browse">
          <Catalog
            segment={segment}
            ownTenantId={session?.activeTenantId}
            canBuy={canBuy}
            inCart={(id) => lines.some((l) => l.product.id === id)}
            onOpen={setProductId}
            onAdd={(p) => put(p, Number(p.moq))}
          />
        </TabsContent>
        {canSeeOrders ? (
          <TabsContent value="orders">
            <BuyerOrders />
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog open={!!productId} onOpenChange={(o) => (!o ? setProductId(null) : undefined)}>
        <SheetContent side="right" className="w-full max-w-xl" aria-describedby={undefined}>
          {productId ? (
            <ProductDetail
              id={productId}
              segment={segment}
              own={(p) => p.tenantId === session?.activeTenantId}
              canBuy={canBuy}
              inCart={lines.find((l) => l.product.id === productId)?.quantity}
              onAdd={(p, q) => (put(p, q), setProductId(null))}
            />
          ) : null}
        </SheetContent>
      </Dialog>

      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="w-full max-w-lg">
          <CartView
            lines={lines}
            segment={segment}
            onQty={(p, q) => setLines((l) => (q === null ? removeLine(l, p.id) : putLine(l, p, q)))}
            onCheckout={(sellerId) => (setCartOpen(false), setCheckoutSeller(sellerId))}
          />
        </SheetContent>
      </Dialog>

      {checkoutGroup ? (
        <CheckoutDialog
          sellerId={checkoutGroup.sellerId}
          sellerName={checkoutGroup.sellerName}
          lines={checkoutGroup.lines}
          segment={segment}
          onClose={() => setCheckoutSeller(null)}
          onPlaced={() => {
            setLines((l) => l.filter((x) => x.product.tenantId !== checkoutGroup.sellerId));
            setCheckoutSeller(null);
            if (canSeeOrders) setTab('orders');
          }}
        />
      ) : null}
    </>
  );
}

const SORTS = [
  ['relevance', 'Best match'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
  ['fastest', 'Fastest delivery'],
] as const;

/** Lowest bulk price this buyer can reach and the pack count it starts at. */
function bestTier(p: MarketProduct, segment: BuyerSegment) {
  const tiers = p.priceTiers.filter((t) => t.segment === 'ALL' || t.segment === segment);
  if (!tiers.length) return null;
  const best = tiers.reduce((a, b) => (Number(b.unitPrice) < Number(a.unitPrice) ? b : a));
  return Number(best.unitPrice) < Number(p.price) ? best : null;
}

function Catalog({
  segment,
  ownTenantId,
  canBuy,
  inCart,
  onOpen,
  onAdd,
}: {
  segment: BuyerSegment;
  ownTenantId?: string;
  canBuy: boolean;
  inCart: (productId: string) => boolean;
  onOpen: (id: string) => void;
  onAdd: (p: MarketProduct) => void;
}) {
  const [q, setQ] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [sellerType, setSellerType] = React.useState('');
  const [inStock, setInStock] = React.useState(true);
  const [sort, setSort] = React.useState('relevance');
  const [page, setPage] = React.useState(1);
  const categories = useApi<MarketplaceCategory[]>('marketplace/categories');
  const list = useApi<Paged<MarketProduct>>('marketplace/products', {
    q: q.trim() || undefined,
    category: category || undefined,
    sellerType: sellerType || undefined,
    inStock: inStock || undefined,
    sort,
    page,
    pageSize: 25,
  });
  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => (set(v), setPage(1));

  const columns: Column<MarketProduct>[] = [
    {
      key: 'name',
      header: 'Product',
      cell: (p) => (
        <div className="flex items-center gap-3">
          <Thumb src={p.images[0]} className="size-10" />
          <div className="min-w-0">
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {[p.brand, pack(p), p.category?.name].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'seller',
      header: 'Seller',
      cell: (p) => (
        <div className="text-sm">
          <p>{p.seller.sellerName}</p>
          {p.seller.ratingCount ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="size-3" aria-hidden /> {n(p.seller.avgRating)} (
              {p.seller.ratingCount})
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price / pack',
      align: 'right',
      cell: (p) => {
        const tier = bestTier(p, segment);
        return (
          <div>
            <p>{formatMoney(p.price)}</p>
            <p className="text-xs text-muted-foreground">
              {tier
                ? `${formatMoney(tier.unitPrice)} from ${n(tier.minQty)}`
                : `+ GST ${n(p.gstRate)}%`}
            </p>
          </div>
        );
      },
    },
    {
      key: 'moq',
      header: 'MOQ',
      align: 'right',
      className: 'whitespace-nowrap',
      cell: (p) => `${n(p.moq)} pack${Number(p.moq) === 1 ? '' : 's'}`,
    },
    {
      key: 'lead',
      header: 'Delivery',
      align: 'right',
      className: 'whitespace-nowrap',
      cell: (p) => leadTime(p.deliveryTimeHours),
    },
    {
      key: 'stock',
      header: 'Stock',
      cell: (p) => <StatusBadge status={p.stockStatus} label={`${n(p.stockQty)} packs`} />,
    },
    ...(canBuy
      ? [
          {
            key: 'add',
            header: <span className="sr-only">Add to cart</span>,
            align: 'right' as const,
            cell: (p: MarketProduct) => {
              if (p.tenantId === ownTenantId)
                return <span className="text-xs text-muted-foreground">Your listing</span>;
              if (inCart(p.id)) return <Badge variant="good">In cart</Badge>;
              const problem = qtyError(p, Number(p.moq));
              return (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!problem}
                  title={problem ?? undefined}
                  onClick={(e) => (e.stopPropagation(), onAdd(p))}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label={`Add ${n(p.moq)} packs of ${p.name} to cart`}
                >
                  <Plus /> Add
                </Button>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <FilterBar>
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search products</span>
          <Input
            className="w-60 pl-8"
            placeholder="Product, brand or tag"
            value={q}
            onChange={(e) => filter(setQ)(e.target.value)}
          />
        </label>
        <Select
          aria-label="Category"
          className="w-44"
          value={category}
          onChange={(e) => filter(setCategory)(e.target.value)}
        >
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Seller type"
          className="w-40"
          value={sellerType}
          onChange={(e) => filter(setSellerType)(e.target.value)}
        >
          <option value="">All sellers</option>
          <option value="SUPPLIER">Suppliers</option>
          <option value="WHOLESALER">Wholesalers</option>
          <option value="RETAILER">Retailers</option>
        </Select>
        <Select
          aria-label="Sort"
          className="w-44"
          value={sort}
          onChange={(e) => filter(setSort)(e.target.value)}
        >
          {SORTS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={inStock} onCheckedChange={filter(setInStock)} />
          In stock only
        </label>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(p) => p.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        onRowClick={(p) => onOpen(p.id)}
        empty={{
          title: 'No products match',
          description: 'Try another category or search, or include out-of-stock products.',
        }}
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
    </>
  );
}

interface ProductDetailData extends Omit<MarketProduct, 'seller'> {
  seller: (MarketProduct['seller'] & { onTimeRate: number }) | null;
  deliveryZones: {
    name: string;
    pincodes: string[];
    deliveryCharge: string;
    freeDeliveryAbove: string | null;
    leadTimeHours: number;
    minOrderValue: string;
  }[];
}

const SEGMENT_LABEL: Record<BuyerSegment, string> = {
  ALL: 'All buyers',
  RESTAURANT: 'Restaurants & carts',
  RETAILER: 'Retailers',
  DEALER: 'Dealers',
};

function ProductDetail({
  id,
  segment,
  own,
  canBuy,
  inCart,
  onAdd,
}: {
  id: string;
  segment: BuyerSegment;
  own: (p: ProductDetailData) => boolean;
  canBuy: boolean;
  inCart?: number;
  onAdd: (p: MarketProduct, quantity: number) => void;
}) {
  const res = useApi<ProductDetailData>(`marketplace/products/${encodeURIComponent(id)}`);
  const [qty, setQty] = React.useState<string>(inCart ? String(inCart) : '');
  const p = res.data;
  if (!p) return <DialogTitle className="sr-only">Loading product</DialogTitle>;
  const quantity = qty === '' ? Number(p.moq) : Number(qty);
  const problem = qtyError(p, quantity);
  const price = unitPrice(p, quantity, segment);
  const seller = p.seller ?? { tenantId: p.tenantId, sellerName: 'Seller', onTimeRate: 1 };
  const facts: [string, React.ReactNode][] = [
    ['Pack', pack(p)],
    ['Price per pack', `${formatMoney(p.price)} + GST ${n(p.gstRate)}%`],
    ...(p.mrp ? [['MRP', formatMoney(p.mrp)] as [string, string]] : []),
    ...(p.hsnCode ? [['HSN', p.hsnCode] as [string, string]] : []),
    ['Minimum order', `${n(p.moq)} packs`],
    ['Then in steps of', `${n(p.stepQty)} packs`],
    ...(p.maxOrderQty ? [['Max per order', `${n(p.maxOrderQty)} packs`] as [string, string]] : []),
    ['Stock', <StatusBadge key="s" status={p.stockStatus} label={`${n(p.stockQty)} packs`} />],
    ['Delivery in', leadTime(p.deliveryTimeHours)],
  ];

  return (
    <div className="grid gap-5">
      <div className="flex gap-4 pr-8">
        <Thumb src={p.images[0]} className="size-20" />
        <div className="min-w-0">
          <DialogTitle>{p.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {[p.brand, p.category?.name, p.sku].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 text-sm">
            {seller.sellerName}
            {seller.ratingCount ? (
              <span className="text-muted-foreground">
                {' '}
                · <Star className="inline size-3" aria-hidden /> {n(seller.avgRating)} (
                {seller.ratingCount}) · {formatPercent(seller.onTimeRate * 100, 0)} on time
              </span>
            ) : null}
          </p>
        </div>
      </div>
      {p.description ? <p className="text-sm">{p.description}</p> : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {facts.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
      </dl>

      {p.priceTiers.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Bulk prices (per pack, before GST)</h3>
          <table className="w-full text-sm">
            <caption className="sr-only">Bulk prices</caption>
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 pr-3 font-medium">Packs</th>
                <th className="py-1.5 pr-3 font-medium">For</th>
                <th className="py-1.5 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {p.priceTiers.map((t, i) => (
                <tr key={t.id ?? i} className="border-b last:border-0">
                  <td className="py-1.5 pr-3">
                    {n(t.minQty)}
                    {t.maxQty != null ? `–${n(t.maxQty)}` : '+'}
                  </td>
                  <td className="py-1.5 pr-3">{SEGMENT_LABEL[t.segment]}</td>
                  <td className="py-1.5 text-right">{formatMoney(t.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {p.deliveryZones.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Delivers to</h3>
          <ul className="grid gap-1 text-sm">
            {p.deliveryZones.map((z) => (
              <li key={z.name}>
                <span className="font-medium">{z.name}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {Number(z.deliveryCharge) ? formatMoney(z.deliveryCharge) : 'free'} delivery
                  {z.freeDeliveryAbove ? `, free above ${formatMoney(z.freeDeliveryAbove)}` : ''}
                  {Number(z.minOrderValue) ? ` · min order ${formatMoney(z.minOrderValue)}` : ''}
                  {z.pincodes.length ? ` · ${z.pincodes.length} pincodes` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canBuy && !own(p) ? (
        <form
          className="grid gap-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) onAdd({ ...p, seller }, quantity);
          }}
        >
          <Field label="Packs" error={qty === '' ? undefined : (problem ?? undefined)}>
            <Input
              type="number"
              inputMode="decimal"
              min={Number(p.moq)}
              step={Number(p.stepQty) || 1}
              placeholder={String(Number(p.moq))}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          {!problem ? (
            <p className="text-sm text-muted-foreground">
              {n(quantity)} × {formatMoney(price)} = {formatMoney(quantity * price)} + GST
            </p>
          ) : null}
          <Button type="submit" disabled={!!problem}>
            <ShoppingCart /> {inCart ? 'Update cart' : 'Add to cart'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function CartView({
  lines,
  segment,
  onQty,
  onCheckout,
}: {
  lines: CartLine[];
  segment: BuyerSegment;
  onQty: (p: MarketProduct, quantity: number | null) => void;
  onCheckout: (sellerId: string) => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="pr-8">
        <DialogTitle>Cart</DialogTitle>
        <DialogDescription>
          One order per seller. Prices are estimates before GST.
        </DialogDescription>
      </div>
      {!lines.length ? (
        <EmptyState
          icon={<ShoppingCart />}
          title="Your cart is empty"
          description="Add products from the marketplace."
        />
      ) : null}
      {bySeller(lines).map((g) => {
        const totals = cartTotals(g.lines, segment);
        const invalid = g.lines.some((l) => qtyError(l.product, l.quantity));
        return (
          <section key={g.sellerId} className="grid gap-3 rounded-lg border p-4">
            <h3 className="font-semibold">{g.sellerName}</h3>
            <ul className="grid gap-3">
              {g.lines.map(({ product: p, quantity }) => {
                const problem = qtyError(p, quantity);
                const up = nextQty(p, quantity, 1);
                return (
                  <li key={p.id} className="grid gap-1 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {pack(p)} · {formatMoney(unitPrice(p, quantity, segment))} / pack
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => onQty(p, null)}
                        aria-label={`Remove ${p.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => onQty(p, nextQty(p, quantity, -1))}
                        aria-label={`One step fewer ${p.name}`}
                      >
                        <Minus />
                      </Button>
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="h-8 w-20 text-center"
                        value={quantity}
                        onChange={(e) => onQty(p, Number(e.target.value))}
                        aria-label={`Packs of ${p.name}`}
                        aria-invalid={problem ? true : undefined}
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        disabled={up === null}
                        onClick={() => up !== null && onQty(p, up)}
                        aria-label={`One step more ${p.name}`}
                      >
                        <Plus />
                      </Button>
                      <span className="ml-auto tabular">
                        {formatMoney(quantity * unitPrice(p, quantity, segment))}
                      </span>
                    </div>
                    {problem ? (
                      <p className="text-xs text-destructive" role="alert">
                        {problem}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <dl className="ml-auto grid w-56 grid-cols-2 gap-y-1 text-sm tabular">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-right">{formatMoney(totals.subtotal)}</dd>
              <dt className="text-muted-foreground">GST (est.)</dt>
              <dd className="text-right">{formatMoney(totals.gst)}</dd>
              <dt className="font-semibold">Total (est.)</dt>
              <dd className="text-right font-semibold">{formatMoney(totals.total)}</dd>
            </dl>
            <Button disabled={invalid} onClick={() => onCheckout(g.sellerId)}>
              Checkout with {g.sellerName}
            </Button>
          </section>
        );
      })}
    </div>
  );
}

interface Address {
  contactName: string;
  contactPhone: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  lat?: number;
  lng?: number;
}
interface Place {
  key: string;
  label: string;
  address: Address;
}
interface AddressRow {
  name: string;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
}
interface Slot {
  id: string;
  label: string | null;
  startTime: string;
  endTime: string;
  capacity: number;
  booked: number;
  available: boolean;
  reason: string | null;
}

const toAddress = (r: AddressRow): Address => ({
  contactName: r.name,
  contactPhone: r.phone ?? '',
  line1: r.addressLine1 ?? '',
  city: r.city ?? '',
  state: r.state ?? '',
  pincode: r.pincode ?? '',
  lat: r.lat ?? undefined,
  lng: r.lng ?? undefined,
});

/** Delivery places: the buyer's outlets (restaurants and carts), then the business address. */
function CheckoutDialog(props: {
  sellerId: string;
  sellerName: string;
  lines: CartLine[];
  segment: BuyerSegment;
  onClose: () => void;
  onPlaced: () => void;
}) {
  const tenant = useApi<AddressRow & { type: string }>('tenants/current');
  const hasOutlets = tenant.data?.type === 'RESTAURANT' || tenant.data?.type === 'FOOD_CART';
  const outlets = useApi<(AddressRow & { id: string })[]>(hasOutlets ? 'merchant/outlets' : null);
  const ready = tenant.data && (!hasOutlets || outlets.data);
  const places: Place[] = ready
    ? [
        ...(outlets.data ?? []).map((o) => ({ key: o.id, label: o.name, address: toAddress(o) })),
        {
          key: 'business',
          label: `${tenant.data!.name} (business address)`,
          address: toAddress(tenant.data!),
        },
      ]
    : [];
  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Order from {props.sellerName}</DialogTitle>
          <DialogDescription>
            The seller confirms the order and reserves stock; delivery charge and any dealer
            discount are added at their terms.
          </DialogDescription>
        </DialogHeader>
        {ready ? <CheckoutForm {...props} places={places} /> : <Spinner />}
      </DialogContent>
    </Dialog>
  );
}

function CheckoutForm({
  sellerId,
  lines,
  segment,
  places,
  onPlaced,
}: {
  sellerId: string;
  lines: CartLine[];
  segment: BuyerSegment;
  places: Place[];
  onPlaced: () => void;
}) {
  const [placeKey, setPlaceKey] = React.useState(places[0]!.key);
  const [addr, setAddr] = React.useState<Address>(places[0]!.address);
  const [date, setDate] = React.useState(istDate(1));
  const [slotId, setSlotId] = React.useState('');
  const [terms, setTerms] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [idempotencyKey] = React.useState(newIdempotencyKey);
  const slots = useApi<Slot[]>(`marketplace/sellers/${sellerId}/slots`, { date });
  const open = (slots.data ?? []).filter((s) => s.available);
  const slot = open.find((s) => s.id === slotId) ?? open[0];
  const noSlotLeft = !!slots.data?.length && !open.length;
  const totals = cartTotals(lines, segment);
  // the coordinates belong to the picked place; an edited address keeps only the pincode match
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddr({ ...addr, [k]: e.target.value, lat: undefined, lng: undefined });

  const place = useApiMutation(
    () =>
      api.post<SellerOrder>(
        'marketplace/orders',
        {
          sellerTenantId: sellerId,
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
          deliveryAddress: {
            ...addr,
            contactName: addr.contactName.trim() || undefined,
            contactPhone: addr.contactPhone.trim() || undefined,
            line1: addr.line1.trim(),
            city: addr.city.trim(),
            state: addr.state.trim(),
          },
          deliverySlotId: slot?.id,
          deliveryDate: slot ? date : undefined,
          paymentTerms: terms || undefined,
          notes: notes.trim() || undefined,
        },
        { idempotencyKey },
      ),
    {
      invalidate: ['marketplace/orders', 'marketplace/products', 'marketplace/sellers'],
      success: (o) => `${o.orderNumber} placed: ${formatMoney(o.total)} incl. GST and delivery`,
      onSuccess: onPlaced,
    },
  );

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => (e.preventDefault(), place.mutate())}
    >
      <Field label="Deliver to" className="sm:col-span-2">
        <Select
          value={placeKey}
          onChange={(e) => {
            const p = places.find((x) => x.key === e.target.value)!;
            setPlaceKey(p.key);
            setAddr(p.address);
          }}
        >
          {places.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <Input value={addr.line1} onChange={set('line1')} maxLength={200} required />
      </Field>
      <Field label="City">
        <Input value={addr.city} onChange={set('city')} maxLength={80} required />
      </Field>
      <Field label="State">
        <Input value={addr.state} onChange={set('state')} maxLength={80} required />
      </Field>
      <Field label="Pincode">
        <Input
          value={addr.pincode}
          onChange={set('pincode')}
          inputMode="numeric"
          pattern="\d{6}"
          title="6-digit pincode"
          required
        />
      </Field>
      <Field label="Contact phone">
        <Input
          value={addr.contactPhone}
          onChange={(e) => setAddr({ ...addr, contactPhone: e.target.value })}
          inputMode="tel"
          maxLength={20}
        />
      </Field>
      <Field label="Delivery date">
        <Input
          type="date"
          min={istDate()}
          value={date}
          onChange={(e) => (setDate(e.target.value), setSlotId(''))}
          required
        />
      </Field>
      <Field
        label="Delivery slot"
        hint={
          slots.data && !slots.data.length
            ? 'No slots this day: delivered within the usual lead time'
            : undefined
        }
        error={
          noSlotLeft
            ? 'Every slot this day is full or past its cut-off; pick another day'
            : undefined
        }
      >
        <Select
          value={slot?.id ?? ''}
          onChange={(e) => setSlotId(e.target.value)}
          disabled={!slots.data?.length}
        >
          {!slots.data?.length || noSlotLeft ? <option value="">—</option> : null}
          {(slots.data ?? []).map((s) => (
            <option key={s.id} value={s.id} disabled={!s.available}>
              {s.label ? `${s.label}, ` : ''}
              {s.startTime}–{s.endTime}
              {s.available ? ` (${s.capacity - s.booked} left)` : ` (${s.reason})`}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Payment" hint="Credit terms are for the seller's registered dealers">
        <Select value={terms} onChange={(e) => setTerms(e.target.value)}>
          <option value="">Your agreed terms (else prepaid)</option>
          {PAYMENT_TERMS.map((t) => (
            <option key={t} value={t}>
              {t === 'COD' ? 'Cash on delivery' : humanize(t)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note to seller">
        <Textarea
          rows={1}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
        />
      </Field>
      <dl className="grid grid-cols-2 gap-y-1 text-sm tabular sm:col-span-2 sm:ml-auto sm:w-64">
        <dt className="text-muted-foreground">
          {lines.length} item{lines.length === 1 ? '' : 's'}
        </dt>
        <dd className="text-right">{formatMoney(totals.subtotal)}</dd>
        <dt className="text-muted-foreground">GST (est.)</dt>
        <dd className="text-right">{formatMoney(totals.gst)}</dd>
        <dt className="font-semibold">Total (est.)</dt>
        <dd className="text-right font-semibold">{formatMoney(totals.total)}</dd>
      </dl>
      <DialogFooter className="sm:col-span-2">
        <Button
          type="submit"
          loading={place.isPending}
          disabled={noSlotLeft || !slots.data || slots.isFetching}
        >
          Place order
        </Button>
      </DialogFooter>
    </form>
  );
}
