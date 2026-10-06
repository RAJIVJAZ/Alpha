'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  Bike,
  CreditCard,
  Crosshair,
  Landmark,
  Plus,
  ShoppingBag,
  Smartphone,
  Ticket,
  Wallet,
  X,
} from 'lucide-react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { EmptyState, ErrorNotice } from '../components/layout';
import { Skeleton } from '../components/misc';
import { api, ApiError, newIdempotencyKey } from '../lib/api';
import { formatMoney } from '../lib/format';
import { toast, useApi, useApiMutation, useSession } from '../lib/hooks';
import { cn } from '../lib/utils';
import { devicePosition, Stepper, useCart, usePlace, VegMark } from './common';
import type {
  Address,
  Cart,
  CheckoutResult,
  Coupon,
  OutletDetail,
  PaymentIntent,
  PaymentMethod,
  Pricing,
  Quote,
  WalletStatement,
} from './types';

/* ------------------------------------------------------------------ payments */

type PayOutcome = 'paid' | 'failed' | 'cancelled';
type PayRequest = {
  purpose: 'ORDER' | 'WALLET_TOPUP' | 'MEMBERSHIP' | 'MEAL_SUBSCRIPTION';
  referenceId?: string;
  method: Exclude<PaymentMethod, 'COD'>;
  amount?: number;
};

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
type RazorpayCtor = new (opts: Record<string, unknown>) => {
  open(): void;
  on(event: string, cb: () => void): void;
};

const loadRazorpay = () =>
  new Promise<RazorpayCtor>((resolve, reject) => {
    const w = window as unknown as { Razorpay?: RazorpayCtor };
    if (w.Razorpay) return resolve(w.Razorpay);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () =>
      w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Payment window failed to load'));
    s.onerror = () => reject(new Error('Payment window failed to load — check your connection'));
    document.head.appendChild(s);
  });

/**
 * Runs a payment end to end: creates the intent, then settles it from the
 * wallet, through Razorpay Checkout, or — on non-production gateways — a
 * sandbox sheet that simulates the bank's answer.
 */
export function usePayment() {
  const [sandbox, setSandbox] = React.useState<{
    intent: PaymentIntent;
    resolve: (o: PayOutcome) => void;
  } | null>(null);

  const pay = React.useCallback(async (req: PayRequest): Promise<PayOutcome> => {
    const intent = await api.post<PaymentIntent>('payments/intents', req, {
      idempotencyKey: newIdempotencyKey(),
    });
    if (intent.state === 'CAPTURED') return 'paid';
    if (intent.sandbox)
      return new Promise<PayOutcome>((resolve) => setSandbox({ intent, resolve }));
    const Razorpay = await loadRazorpay();
    return new Promise<PayOutcome>((resolve) => {
      const rz = new Razorpay({
        ...intent.checkout,
        handler: async (r: RazorpayResponse) => {
          try {
            await api.post('payments/verify', {
              paymentId: intent.paymentId,
              razorpayOrderId: r.razorpay_order_id,
              razorpayPaymentId: r.razorpay_payment_id,
              razorpaySignature: r.razorpay_signature,
            });
            resolve('paid');
          } catch {
            resolve('failed');
          }
        },
        modal: { ondismiss: () => resolve('cancelled') },
      });
      rz.on('payment.failed', () => resolve('failed'));
      rz.open();
    });
  }, []);

  const element = sandbox ? (
    <SandboxCheckout
      intent={sandbox.intent}
      onDone={(o) => {
        sandbox.resolve(o);
        setSandbox(null);
      }}
    />
  ) : null;
  return { pay, element };
}

function SandboxCheckout({
  intent,
  onDone,
}: {
  intent: PaymentIntent;
  onDone: (o: PayOutcome) => void;
}) {
  const [busy, setBusy] = React.useState<'ok' | 'fail' | null>(null);
  const finish = async (success: boolean) => {
    setBusy(success ? 'ok' : 'fail');
    try {
      await api.post(`payments/sandbox/${intent.paymentId}/complete`, { success });
      onDone(success ? 'paid' : 'failed');
    } catch (e) {
      toast.error((e as Error).message);
      onDone('failed');
    }
  };
  const desc =
    typeof intent.checkout?.description === 'string'
      ? intent.checkout.description
      : 'FoodGrid payment';
  return (
    <Dialog open onOpenChange={(o) => (!o ? onDone('cancelled') : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test payment · {formatMoney(intent.amount)}</DialogTitle>
          <DialogDescription>
            {desc}. This environment uses the payment sandbox, so no money moves — choose how the
            bank answers.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            loading={busy === 'fail'}
            disabled={!!busy}
            onClick={() => finish(false)}
          >
            Simulate failure
          </Button>
          <Button loading={busy === 'ok'} disabled={!!busy} onClick={() => finish(true)}>
            Pay {formatMoney(intent.amount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ addresses */

const blankAddress = {
  label: 'Home',
  contactName: '',
  contactPhone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '',
};

/** Add or edit a delivery address; the pin comes from the device or the chosen area. */
export function AddressDialog({
  address,
  onClose,
  onSaved,
}: {
  address?: Address | null;
  onClose: () => void;
  onSaved?: (a: Address) => void;
}) {
  const { place } = usePlace();
  const [form, setForm] = React.useState(
    () =>
      (address
        ? {
            ...blankAddress,
            ...Object.fromEntries(Object.entries(address).map(([k, v]) => [k, v ?? ''])),
          }
        : blankAddress) as typeof blankAddress,
  );
  const [pin, setPin] = React.useState({
    lat: address?.lat ?? place.lat,
    lng: address?.lng ?? place.lng,
    source: address ? 'saved' : 'area',
  });
  const [locating, setLocating] = React.useState(false);
  const set =
    (k: keyof typeof blankAddress) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value });
  const save = useApiMutation(
    async () => {
      const body = {
        label: form.label,
        contactName: form.contactName || undefined,
        contactPhone: form.contactPhone || undefined,
        line1: form.line1,
        line2: form.line2 || undefined,
        landmark: form.landmark || undefined,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        lat: pin.lat,
        lng: pin.lng,
      };
      return address
        ? api.patch<Address>(`users/me/addresses/${address.id}`, body)
        : api.post<Address>('users/me/addresses', body);
    },
    {
      invalidate: ['users/me/addresses'],
      success: 'Address saved',
      onSuccess: (a) => (onSaved?.(a), onClose()),
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{address ? 'Edit address' : 'Add a delivery address'}</DialogTitle>
          <DialogDescription>
            Riders navigate to the pin, so set it from where the order should arrive.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <span>
              Pin: {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              <span className="block text-xs text-muted-foreground">
                {pin.source === 'device'
                  ? 'From this device'
                  : pin.source === 'saved'
                    ? 'Saved pin'
                    : `Centre of ${place.label}`}
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={locating}
              onClick={() => {
                setLocating(true);
                devicePosition()
                  .then((p) => setPin({ ...p, source: 'device' }))
                  .catch((e: Error) => toast.error(e.message))
                  .finally(() => setLocating(false));
              }}
            >
              <Crosshair /> Use my location
            </Button>
          </div>
          <Field label="Flat, house no., building">
            <Input value={form.line1} onChange={set('line1')} required maxLength={200} />
          </Field>
          <Field label="Area, street (optional)">
            <Input value={form.line2} onChange={set('line2')} maxLength={200} />
          </Field>
          <Field label="Landmark (optional)">
            <Input value={form.landmark} onChange={set('landmark')} maxLength={120} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input value={form.city} onChange={set('city')} required />
            </Field>
            <Field label="Pincode">
              <Input
                value={form.pincode}
                onChange={set('pincode')}
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Save as">
              <Select value={form.label} onChange={set('label')}>
                {['Home', 'Work', 'Other'].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Receiver's phone (optional)">
              <Input type="tel" value={form.contactPhone} onChange={set('contactPhone')} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" loading={save.isPending}>
              Save address
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ cart & checkout */

const METHODS: { id: PaymentMethod; label: string; icon: typeof Wallet; hint?: string }[] = [
  { id: 'UPI', label: 'UPI', icon: Smartphone, hint: 'Google Pay, PhonePe, Paytm or any UPI app' },
  { id: 'CARD', label: 'Credit or debit card', icon: CreditCard },
  { id: 'NETBANKING', label: 'Net banking', icon: Landmark },
  { id: 'WALLET', label: 'FoodGrid wallet', icon: Wallet },
  { id: 'COD', label: 'Cash on delivery', icon: Banknote },
];
const TIPS = [0, 20, 30, 50];

export function CartView() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, isLoading: sessionLoading } = useSession();
  const cart = useCart();
  const c = cart.data;
  const outlet = useApi<OutletDetail>(c?.outletId ? `outlets/${c.outletId}` : null);
  const addresses = useApi<Address[]>(session ? 'users/me/addresses' : null);
  const wallet = useApi<WalletStatement>(session ? 'wallets/me' : null, { pageSize: 1 });
  const [orderType, setOrderType] = React.useState<'DELIVERY' | 'TAKEAWAY'>('DELIVERY');
  const [addressId, setAddressId] = React.useState<string | null>(null);
  const [tip, setTip] = React.useState(0);
  const [method, setMethod] = React.useState<PaymentMethod>('UPI');
  const [notes, setNotes] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [placing, setPlacing] = React.useState(false);
  const { pay, element: paymentSheet } = usePayment();
  const idem = React.useRef(newIdempotencyKey());

  const address =
    (addresses.data ?? []).find((a) => a.id === addressId) ??
    (addresses.data ?? []).find((a) => a.isDefault) ??
    addresses.data?.[0] ??
    null;
  const delivery = orderType === 'DELIVERY';
  const quote = useQuery({
    queryKey: [
      'cart-quote',
      c?.lines.map((l) => `${l.lineId}:${l.quantity}`).join(),
      c?.couponCode,
      orderType,
      address?.id,
      tip,
      method,
    ],
    queryFn: () =>
      api.post<Quote>('cart/quote', {
        orderType,
        lat: delivery ? address?.lat : undefined,
        lng: delivery ? address?.lng : undefined,
        tip: delivery ? tip : undefined,
        paymentMethod: method,
      }),
    enabled: !!c?.lines.length && (!delivery || !!address),
  });

  // banner deep links land here with ?coupon=CODE
  const couponParam = params.get('coupon');
  const applied = React.useRef(false);
  React.useEffect(() => {
    if (!couponParam || applied.current || !c?.lines.length || c.couponCode) return;
    applied.current = true;
    api
      .post('cart/coupon', { code: couponParam })
      .then(() => cart.refetch())
      .then(() => toast.success(`${couponParam} applied`))
      .catch((e: Error) => toast.error(e.message));
  }, [couponParam, c, cart]);

  React.useEffect(() => {
    if (outlet.data && !outlet.data.acceptsDelivery) setOrderType('TAKEAWAY');
  }, [outlet.data]);

  if (sessionLoading || (session && cart.isLoading)) return <Skeleton className="h-96" />;
  if (!session)
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title="Sign in to see your cart"
        description="Your cart is saved to your account, so it follows you across devices."
        action={
          <Button asChild>
            <Link href="/login?next=/cart">Sign in</Link>
          </Button>
        }
      />
    );
  if (!c?.lines.length)
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title="Your cart is empty"
        description="Add dishes from a restaurant or food cart near you."
        action={
          <Button asChild>
            <Link href="/">Find food</Link>
          </Button>
        }
      />
    );

  const q = quote.data;
  const pricing = q?.cart.pricing ?? null;
  const balance = Number(wallet.data?.wallet.balance ?? 0);
  const total = Number(pricing?.total ?? 0);
  const unserviceable = delivery && q?.delivery && !q.delivery.serviceable;
  const closed = outlet.data && !outlet.data.isOpenNow;
  const belowMin =
    outlet.data && Number(outlet.data.minOrderValue) > Number(pricing?.subtotal ?? 0);
  const walletShort = method === 'WALLET' && balance < total;
  const blocker = closed
    ? 'The kitchen is closed right now'
    : belowMin
      ? `Minimum order is ${formatMoney(outlet.data!.minOrderValue, { whole: true })}`
      : delivery && !address
        ? 'Add a delivery address'
        : unserviceable
          ? (q?.delivery?.reason ?? 'This address is too far for delivery')
          : walletShort
            ? 'Wallet balance is too low — pick another way to pay'
            : null;

  const payLabel =
    method === 'COD' ? 'Place order' : `Pay ${pricing ? formatMoney(pricing.total) : ''}`;

  const place = async () => {
    setPlacing(true);
    try {
      const res = await api.post<CheckoutResult>(
        'orders',
        {
          orderType,
          paymentMethod: method,
          tip: delivery && tip ? tip : undefined,
          specialInstructions: notes.trim() || undefined,
          deliveryAddress:
            delivery && address
              ? {
                  label: address.label,
                  contactName: address.contactName ?? undefined,
                  contactPhone: address.contactPhone ?? undefined,
                  line1: address.line1,
                  line2: address.line2 ?? undefined,
                  landmark: address.landmark ?? undefined,
                  city: address.city,
                  state: address.state,
                  pincode: address.pincode,
                  lat: address.lat,
                  lng: address.lng,
                }
              : undefined,
        },
        { idempotencyKey: idem.current },
      );
      idem.current = newIdempotencyKey();
      // the server emptied the cart; refresh it only after paying, or this page
      // would switch to the empty state and unmount the payment sheet
      if (res.payment.required && method !== 'COD') {
        const outcome = await pay({
          purpose: 'ORDER',
          referenceId: res.order.id,
          method: method as Exclude<PaymentMethod, 'COD'>,
        });
        if (outcome !== 'paid')
          toast.error(
            outcome === 'failed'
              ? 'Payment failed — you can retry from the order page'
              : 'Payment not completed — retry from the order page',
          );
      }
      router.push(`/orders/${res.order.id}`);
      void cart.refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not place the order');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 pb-24 lg:grid-cols-[1fr_24rem] lg:items-start lg:pb-0">
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <CartLines cart={c} outlet={outlet.data} onChange={() => void cart.refetch()} />
        {outlet.data?.acceptsTakeaway && outlet.data.acceptsDelivery ? (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Order type">
            {(['DELIVERY', 'TAKEAWAY'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={orderType === t}
                onClick={() => setOrderType(t)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium',
                  orderType === t
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'bg-card hover:bg-muted',
                )}
              >
                {t === 'DELIVERY' ? (
                  <Bike className="size-4" aria-hidden />
                ) : (
                  <ShoppingBag className="size-4" aria-hidden />
                )}
                {t === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
              </button>
            ))}
          </div>
        ) : null}
        {delivery ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Deliver to</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus /> New address
              </Button>
            </CardHeader>
            <CardContent className="grid gap-2">
              {(addresses.data ?? []).map((a) => (
                <label
                  key={a.id}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-lg border px-3 py-2 text-sm',
                    address?.id === a.id && 'border-primary bg-accent',
                  )}
                >
                  <input
                    type="radio"
                    name="address"
                    className="mt-1 accent-[var(--primary)]"
                    checked={address?.id === a.id}
                    onChange={() => setAddressId(a.id)}
                  />
                  <span>
                    <span className="font-medium">{a.label}</span>
                    <span className="block text-muted-foreground">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.pincode}
                    </span>
                  </span>
                </label>
              ))}
              {addresses.data && !addresses.data.length ? (
                <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
              ) : null}
              {q?.delivery?.serviceable ? (
                <p className="text-sm text-muted-foreground">
                  Arrives in about {q.delivery.etaMins} min · {q.delivery.distanceKm.toFixed(1)} km
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <p className="rounded-xl border bg-card px-4 py-3 text-sm">
            Pick up from <span className="font-medium">{outlet.data?.name}</span>,{' '}
            {outlet.data?.addressLine1}. We&apos;ll tell you when it&apos;s ready.
          </p>
        )}
        {delivery ? (
          <Card>
            <CardHeader>
              <CardTitle>Tip your rider</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {TIPS.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  className="rounded-full"
                  variant={tip === t ? 'default' : 'outline'}
                  aria-pressed={tip === t}
                  onClick={() => setTip(t)}
                >
                  {t ? formatMoney(t, { whole: true }) : 'No tip'}
                </Button>
              ))}
              <p className="w-full text-xs text-muted-foreground">
                The whole tip goes to your rider.
              </p>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Pay with</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2" role="radiogroup" aria-label="Payment method">
            {METHODS.filter((m) => m.id !== 'COD' || delivery).map((m) => {
              const lowWallet = m.id === 'WALLET' && balance < total;
              return (
                <label
                  key={m.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm',
                    method === m.id && 'border-primary bg-accent',
                  )}
                >
                  <input
                    type="radio"
                    name="method"
                    className="accent-[var(--primary)]"
                    checked={method === m.id}
                    onChange={() => setMethod(m.id)}
                  />
                  <m.icon className="size-4 text-muted-foreground" aria-hidden />
                  <span className="flex-1">
                    {m.label}
                    {m.id === 'WALLET' ? (
                      <span
                        className={cn(
                          'block text-xs',
                          lowWallet ? 'text-status-critical' : 'text-muted-foreground',
                        )}
                      >
                        Balance {formatMoney(balance)}
                        {lowWallet ? ' — not enough for this order' : ''}
                      </span>
                    ) : m.hint ? (
                      <span className="block text-xs text-muted-foreground">{m.hint}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </CardContent>
        </Card>
        <Field label="Instructions for the restaurant (optional)">
          <Textarea
            rows={2}
            maxLength={300}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ring the bell, no cutlery…"
          />
        </Field>
      </div>
      <aside className="grid gap-4 lg:sticky lg:top-20">
        <CouponCard cart={c} onChange={() => void cart.refetch()} />
        <Card>
          <CardHeader>
            <CardTitle>Bill details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {quote.error ? <ErrorNotice error={quote.error} /> : null}
            {pricing ? (
              <Bill
                pricing={pricing}
                delivery={delivery}
                member={q?.isMember}
                waivedDeliveryFee={q?.delivery?.deliveryFee}
              />
            ) : quote.isFetching ? (
              <Skeleton className="h-40" />
            ) : (
              <p className="text-sm text-muted-foreground">
                {delivery && !address ? 'Add an address to see delivery charges.' : '—'}
              </p>
            )}
            {blocker ? (
              <p role="status" className="rounded-lg bg-status-warning/15 px-3 py-2 text-sm">
                {blocker}
              </p>
            ) : null}
            <Button
              size="lg"
              disabled={!!blocker || !pricing || quote.isFetching}
              loading={placing}
              onClick={place}
            >
              {payLabel}
            </Button>
            <p className="text-xs text-muted-foreground">
              Cancel free of charge until the restaurant accepts your order.
            </p>
          </CardContent>
        </Card>
      </aside>
      {/* phones: the bill is far down the page, so keep paying one tap away */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-sm">
            <span className="block font-semibold tabular">
              {pricing ? formatMoney(pricing.total) : '—'}
            </span>
            <span className="text-xs text-muted-foreground">{blocker ?? 'Total to pay'}</span>
          </span>
          <Button
            disabled={!!blocker || !pricing || quote.isFetching}
            loading={placing}
            onClick={place}
          >
            {payLabel}
          </Button>
        </div>
      </div>
      {adding ? (
        <AddressDialog onClose={() => setAdding(false)} onSaved={(a) => setAddressId(a.id)} />
      ) : null}
      {paymentSheet}
    </div>
  );
}

function CartLines({
  cart,
  outlet,
  onChange,
}: {
  cart: Cart;
  outlet: OutletDetail | undefined;
  onChange: () => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const change = async (lineId: string, n: number) => {
    setBusy(lineId);
    try {
      if (n <= 0) await api.delete(`cart/items/${lineId}`);
      else await api.patch(`cart/items/${lineId}`, { quantity: Math.min(n, 50) });
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
          <Link href={outlet ? `/r/${outlet.slug}` : '#'} className="hover:underline">
            {cart.outletName}
          </Link>
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await api.delete('cart');
            onChange();
          }}
        >
          Clear
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        {cart.removedItems.length ? (
          <p className="rounded-lg bg-status-warning/15 px-3 py-2 text-sm">
            Removed because they are unavailable now: {cart.removedItems.join(', ')}
          </p>
        ) : null}
        {cart.lines.map((l) => (
          <div key={l.lineId} className="flex items-start gap-3">
            <VegMark veg={l.isVeg} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{l.name}</p>
              {l.variant || l.addons.length ? (
                <p className="text-xs text-muted-foreground">
                  {[l.variant, ...l.addons].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
            <Stepper
              value={l.quantity}
              onChange={(n) => change(l.lineId, n)}
              busy={busy === l.lineId}
              label={l.name}
            />
            <span className="w-20 text-right text-sm tabular">{formatMoney(l.totalPrice)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CouponCard({ cart, onChange }: { cart: Cart; onChange: () => void }) {
  const coupons = useApi<Coupon[]>('coupons', { outletId: cart.outletId ?? undefined });
  const [code, setCode] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const apply = useApiMutation((c: string) => api.post('cart/coupon', { code: c }), {
    success: 'Coupon applied',
    onSuccess: () => (onChange(), setOpen(false), setCode('')),
  });
  const remove = useApiMutation(() => api.delete('cart/coupon'), { onSuccess: onChange });
  return (
    <Card>
      <CardContent className="grid gap-3 pt-5">
        {cart.couponCode ? (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm">
              <Ticket className="size-4 text-primary" aria-hidden />
              <span>
                <span className="font-semibold">{cart.couponCode}</span> applied
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
              aria-label="Remove coupon"
            >
              <X /> Remove
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="justify-start" onClick={() => setOpen(true)}>
            <Ticket /> Apply a coupon
          </Button>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Coupons</DialogTitle>
            <DialogDescription>Offers you can use on this order.</DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(e) => (
              e.preventDefault(),
              code.trim() && apply.mutate(code.trim().toUpperCase())
            )}
          >
            <Input
              aria-label="Coupon code"
              placeholder="Enter a code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="uppercase"
            />
            <Button type="submit" loading={apply.isPending}>
              Apply
            </Button>
          </form>
          <ul className="grid gap-2">
            {(coupons.data ?? []).map((cp) => (
              <li
                key={cp.code}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2',
                  !cp.eligible && 'opacity-60',
                )}
              >
                <span className="grid">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {cp.code} {cp.eligible ? null : <Badge variant="neutral">Not eligible</Badge>}
                  </span>
                  <span className="text-sm">{cp.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {cp.eligible
                      ? Number(cp.minOrderValue)
                        ? `On orders above ${formatMoney(cp.minOrderValue, { whole: true })}`
                        : 'No minimum order'
                      : cp.reason}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!cp.eligible || apply.isPending}
                  onClick={() => apply.mutate(cp.code)}
                >
                  Apply
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function Bill({
  pricing: p,
  delivery,
  member,
  waivedDeliveryFee,
}: {
  pricing: Pricing;
  delivery: boolean;
  member?: boolean;
  waivedDeliveryFee?: number;
}) {
  const row = (
    label: React.ReactNode,
    value: string | number,
    opts: { neg?: boolean; strong?: boolean; hide?: boolean } = {},
  ) =>
    opts.hide ? null : (
      <div
        className={cn(
          'flex justify-between gap-3 text-sm',
          opts.strong && 'border-t pt-2 text-base font-semibold',
        )}
      >
        <span className={opts.strong ? '' : 'text-muted-foreground'}>{label}</span>
        <span className={cn('tabular', opts.neg && 'text-delta-up')}>
          {opts.neg ? '−' : ''}
          {formatMoney(value)}
        </span>
      </div>
    );
  const n = (v: string) => Number(v);
  return (
    <div className="grid gap-1.5">
      {row('Item total', p.subtotal)}
      {row(`Coupon discount`, p.couponDiscount, { neg: true, hide: !n(p.couponDiscount) })}
      {row(member ? 'FoodGrid One discount' : 'Membership discount', p.membershipDiscount, {
        neg: true,
        hide: !n(p.membershipDiscount),
      })}
      {delivery ? (
        !n(p.deliveryFee) && waivedDeliveryFee ? (
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Delivery fee</span>
            <span className="tabular">
              <s className="mr-1.5 text-muted-foreground">{formatMoney(waivedDeliveryFee)}</s>
              <span className="font-medium text-delta-up">FREE</span>
            </span>
          </div>
        ) : (
          row(n(p.deliveryFee) ? 'Delivery fee' : 'Delivery fee (free)', p.deliveryFee)
        )
      ) : null}
      {row('Packaging', p.packagingCharge, { hide: !n(p.packagingCharge) })}
      {row('Platform fee', p.platformFee, { hide: !n(p.platformFee) })}
      {n(p.igst)
        ? row('IGST', p.igst)
        : row('GST (CGST + SGST)', n(p.cgst) + n(p.sgst), { hide: !n(p.taxTotal) })}
      {row('Rider tip', p.tip, { hide: !n(p.tip) })}
      {row('Round off', p.roundOff, { hide: !n(p.roundOff) })}
      {row('To pay', p.total, { strong: true })}
      {n(p.savings) ? (
        <p className="rounded-lg bg-status-good/10 px-3 py-1.5 text-sm text-status-good-text">
          You save {formatMoney(p.savings)} on this order
        </p>
      ) : null}
      {p.messages.map((m) => (
        <p key={m} className="text-xs text-muted-foreground">
          {m}
        </p>
      ))}
    </div>
  );
}
