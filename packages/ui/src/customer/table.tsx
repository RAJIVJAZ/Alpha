'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, UtensilsCrossed } from 'lucide-react';
import { Button } from '../components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Textarea } from '../components/form';
import { EmptyState } from '../components/layout';
import { Skeleton } from '../components/misc';
import { Thumb } from '../components/thumb';
import { api, ApiError, newIdempotencyKey } from '../lib/api';
import { formatMoney } from '../lib/format';
import { toast, useApi, useSession } from '../lib/hooks';
import { cn } from '../lib/utils';
import { nextOpening, Stepper, VegMark, type AddLine } from './common';
import { usePayment } from './checkout';
import { CustomiseDialog, customisable, unitPrice } from './outlet';
import type { MenuItem, TableMenu } from './types';

interface Line extends AddLine {
  key: string;
  name: string;
  isVeg: boolean;
  unit: number;
  detail: string;
}

interface Placed {
  id: string;
  orderNumber: string;
  total: string;
  paid: boolean;
}

/**
 * Dine-in ordering from a table QR code: no sign-in needed to pay at the
 * counter; signed-in guests can pay online. The order goes straight to the KDS.
 */
export function TableOrderView({ token }: { token: string }) {
  const menu = useApi<TableMenu>(`qr/${token}`, undefined, { retry: false });
  const { data: session } = useSession();
  const storeKey = `fg.table.${token}`;
  const [lines, setLines] = React.useState<Line[]>([]);
  const [placed, setPlaced] = React.useState<Placed[]>([]);
  const [customising, setCustomising] = React.useState<MenuItem | null>(null);
  const [review, setReview] = React.useState(false);
  const [vegOnly, setVegOnly] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) ?? 'null') as {
        lines: Line[];
        placed: Placed[];
      } | null;
      if (saved) {
        setLines(saved.lines);
        setPlaced(saved.placed);
      }
    } catch {
      /* ignore */
    }
  }, [storeKey]);
  React.useEffect(() => {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ lines, placed }));
    } catch {
      /* ignore */
    }
  }, [storeKey, lines, placed]);

  if (menu.error)
    return (
      <EmptyState
        icon={<UtensilsCrossed />}
        title="This table code isn't active"
        description={
          menu.error instanceof ApiError && menu.error.status === 404
            ? 'Ask the staff for a fresh QR code.'
            : menu.error.message
        }
      />
    );
  if (!menu.data) return <Skeleton className="h-96" />;
  const { outlet: o, table } = menu.data;

  const add = (item: MenuItem, line: AddLine) => {
    const variant = item.variants.find((v) => v.id === line.variantId);
    const addons = item.addonGroups
      .flatMap((g) => g.addons)
      .filter((a) => line.addonIds?.includes(a.id));
    const key = [
      item.id,
      line.variantId ?? '',
      [...(line.addonIds ?? [])].sort().join('+'),
      line.notes ?? '',
    ].join('|');
    setLines((ls) => {
      const hit = ls.find((l) => l.key === key);
      if (hit)
        return ls.map((l) => (l.key === key ? { ...l, quantity: l.quantity + line.quantity } : l));
      return [
        ...ls,
        {
          ...line,
          key,
          name: item.name,
          isVeg: item.isVeg,
          unit: unitPrice(item, line.variantId, line.addonIds),
          detail: [
            variant && item.variants.length > 1 ? variant.name : null,
            ...addons.map((a) => a.name),
          ]
            .filter(Boolean)
            .join(' · '),
        },
      ];
    });
  };
  const setQty = (key: string, n: number) =>
    setLines((ls) =>
      n <= 0
        ? ls.filter((l) => l.key !== key)
        : ls.map((l) => (l.key === key ? { ...l, quantity: Math.min(n, 30) } : l)),
    );
  const onAdd = (item: MenuItem) =>
    customisable(item)
      ? setCustomising(item)
      : add(item, {
          menuItemId: item.id,
          quantity: 1,
          variantId: item.variants.find((v) => v.isDefault)?.id,
        });
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.unit * l.quantity, 0);
  const open = o.isOpenNow;
  const opens = o.isOpen ? nextOpening(o.openingHours) : null;

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-5 pb-28">
      <header className="flex items-center gap-4 rounded-2xl border bg-card p-4">
        <Thumb src={o.logoUrl ?? o.coverImageUrl} className="size-14 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{o.name}</h1>
          <p className="text-sm text-muted-foreground">
            Table {table.label} · order from your phone, we&apos;ll bring it to you
          </p>
        </div>
      </header>
      {!open ? (
        <p
          role="status"
          className="rounded-xl border border-status-warning/40 bg-status-warning/15 px-4 py-3 text-sm"
        >
          {o.isOpen
            ? `The kitchen is closed right now${opens ? ` — ${opens.toLowerCase()}` : ''}.`
            : 'The kitchen is not taking orders right now.'}
        </p>
      ) : null}
      {placed.length ? (
        <section
          aria-label="Your orders at this table"
          className="grid gap-2 rounded-xl border border-status-good/40 bg-status-good/10 p-4 text-sm"
        >
          {placed.map((p) => (
            <p key={p.id} className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-status-good-text" aria-hidden />
              <span>
                <span className="font-medium">{p.orderNumber}</span> sent to the kitchen ·{' '}
                {formatMoney(p.total)} {p.paid ? 'paid' : 'to pay at the counter'}
              </span>
              {session ? (
                <Link
                  href={`/orders/${p.id}`}
                  className="ml-auto text-primary underline-offset-4 hover:underline"
                >
                  Track
                </Link>
              ) : null}
            </p>
          ))}
        </section>
      ) : null}
      {!o.isPureVeg ? (
        <label className="flex items-center gap-2 justify-self-start text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={vegOnly}
            onChange={(e) => setVegOnly(e.target.checked)}
          />
          <VegMark veg /> Veg only
        </label>
      ) : null}
      {menu.data.categories.map((c) => {
        const items = c.items.filter((i) => !vegOnly || i.isVeg);
        if (!items.length) return null;
        return (
          <section key={c.id} className="grid gap-2">
            <h2 className="text-lg font-semibold">{c.name}</h2>
            <div className="divide-y rounded-xl border bg-card px-4">
              {items.map((i) => {
                const qty = lines
                  .filter((l) => l.menuItemId === i.id)
                  .reduce((s, l) => s + l.quantity, 0);
                const only = lines.filter((l) => l.menuItemId === i.id);
                return (
                  <div
                    key={i.id}
                    className={cn('flex items-center gap-3 py-3', !i.isAvailable && 'opacity-55')}
                  >
                    <VegMark veg={i.isVeg} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{i.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatMoney(i.price, { whole: true })}
                      </span>
                    </span>
                    {!i.isAvailable ? (
                      <span className="text-xs text-muted-foreground">Sold out</span>
                    ) : qty && only.length === 1 && !customisable(i) ? (
                      <Stepper
                        value={qty}
                        onChange={(n) => setQty(only[0]!.key, n)}
                        label={i.name}
                        busy={!open}
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-primary/40 font-semibold text-primary"
                        disabled={!open}
                        onClick={() => onAdd(i)}
                        aria-label={`Add ${i.name}`}
                      >
                        {qty ? `Add more (${qty})` : 'ADD'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {customising ? (
        <CustomiseDialog
          item={customising}
          onClose={() => setCustomising(null)}
          onAdd={async (line) => {
            add(customising, line);
            setCustomising(null);
          }}
        />
      ) : null}
      {count ? (
        <div className="fixed inset-x-0 bottom-4 z-30 px-4">
          <button
            type="button"
            onClick={() => setReview(true)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-xl bg-primary px-5 py-3 text-primary-foreground shadow-lg"
          >
            <span className="text-sm font-medium">
              {count} item{count === 1 ? '' : 's'} · {formatMoney(subtotal, { whole: true })}
            </span>
            <span className="font-semibold">Review order</span>
          </button>
        </div>
      ) : null}
      {review ? (
        <PlaceTableOrder
          token={token}
          lines={lines}
          setQty={setQty}
          subtotal={subtotal}
          signedIn={!!session}
          defaultName={session?.name ?? ''}
          onClose={() => setReview(false)}
          onPlaced={(p) => {
            setPlaced((xs) => [p, ...xs]);
            setLines([]);
            setReview(false);
          }}
        />
      ) : null}
    </div>
  );
}

function PlaceTableOrder({
  token,
  lines,
  setQty,
  subtotal,
  signedIn,
  defaultName,
  onClose,
  onPlaced,
}: {
  token: string;
  lines: Line[];
  setQty: (k: string, n: number) => void;
  subtotal: number;
  signedIn: boolean;
  defaultName: string;
  onClose: () => void;
  onPlaced: (p: Placed) => void;
}) {
  const [name, setName] = React.useState(defaultName);
  const [phone, setPhone] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [payNow, setPayNow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const { pay, element } = usePayment();
  const idem = React.useRef(newIdempotencyKey());
  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<{
        order: { id: string; orderNumber: string; total: string };
        payment: { required: boolean } | null;
      }>(
        `qr/${token}/orders`,
        {
          items: lines.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            variantId: l.variantId,
            addonIds: l.addonIds?.length ? l.addonIds : undefined,
            notes: l.notes,
          })),
          customerName: name.trim() || undefined,
          customerPhone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
          payAtCounter: !payNow,
        },
        { idempotencyKey: idem.current },
      );
      let paid = false;
      if (res.payment?.required) {
        const r = await pay({ purpose: 'ORDER', referenceId: res.order.id, method: 'UPI' });
        paid = r === 'paid';
        if (!paid) toast.error('Payment not completed — please pay at the counter');
      }
      onPlaced({
        id: res.order.id,
        orderNumber: res.order.orderNumber,
        total: res.order.total,
        paid,
      });
      toast.success(`Order ${res.order.orderNumber} sent to the kitchen`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your order</DialogTitle>
          <DialogDescription>
            Taxes are added on the bill. Staff confirm and bring it to your table.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {lines.map((l) => (
            <div key={l.key} className="flex items-center gap-3 text-sm">
              <VegMark veg={l.isVeg} />
              <span className="min-w-0 flex-1">
                {l.name}
                {l.detail ? (
                  <span className="block text-xs text-muted-foreground">{l.detail}</span>
                ) : null}
              </span>
              <Stepper value={l.quantity} onChange={(n) => setQty(l.key, n)} label={l.name} />
              <span className="w-16 text-right tabular">
                {formatMoney(l.unit * l.quantity, { whole: true })}
              </span>
            </div>
          ))}
          <p className="flex justify-between border-t pt-2 font-semibold">
            <span>Item total</span>
            <span className="tabular">{formatMoney(subtotal)}</span>
          </p>
        </div>
        <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), void submit())}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Your name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoComplete="name"
              />
            </Field>
            <Field label="Phone (optional)">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </Field>
          </div>
          <Field label="Note for the kitchen (optional)">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
            />
          </Field>
          <fieldset className="grid gap-2 text-sm">
            <legend className="mb-1 font-medium">Payment</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="pay"
                className="accent-[var(--primary)]"
                checked={!payNow}
                onChange={() => setPayNow(false)}
              />{' '}
              Pay at the counter
            </label>
            <label className={cn('flex items-center gap-2', !signedIn && 'opacity-60')}>
              <input
                type="radio"
                name="pay"
                className="accent-[var(--primary)]"
                checked={payNow}
                disabled={!signedIn}
                onChange={() => setPayNow(true)}
              />{' '}
              Pay now with UPI or card
              {!signedIn ? (
                <Link
                  href={`/login?next=${encodeURIComponent(`/t/${token}`)}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  sign in
                </Link>
              ) : null}
            </label>
          </fieldset>
          <DialogFooter>
            <Button type="submit" loading={busy} disabled={!lines.length}>
              Send to kitchen
            </Button>
          </DialogFooter>
        </form>
        {element}
      </DialogContent>
    </Dialog>
  );
}
