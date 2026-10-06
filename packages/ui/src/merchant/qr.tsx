'use client';

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Printer, RefreshCw } from 'lucide-react';
import { Button } from '../components/button';
import { Card, CardContent } from '../components/card';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input } from '../components/form';
import { EmptyState, PageHeader } from '../components/layout';
import { api } from '../lib/api';
import { useApi, useApiMutation } from '../lib/hooks';
import { OutletPicker, useOutlet } from './outlet';

interface DiningTable {
  id: string;
  label: string;
  seats: number;
  qrToken: string;
  isActive: boolean;
  qrUrl: string;
}

const naturalSort = (a: DiningTable, b: DiningTable) =>
  a.label.localeCompare(b.label, 'en', { numeric: true });

/** Table QR codes: guests scan to see the menu and order to their table. */
export function QrTables() {
  const { outletId, outlet } = useOutlet();
  const key = `merchant/outlets/${outletId}/tables`;
  const tables = useApi<DiningTable[]>(outletId ? key : null);
  const [adding, setAdding] = React.useState(false);
  const [rotating, setRotating] = React.useState<DiningTable | null>(null);
  const rotate = useApiMutation((id: string) => api.post(`merchant/tables/${id}/rotate-qr`), {
    invalidate: [key],
    success: 'New QR code issued; print and replace the old one',
    onSuccess: () => setRotating(null),
  });
  const rows = [...(tables.data ?? [])].sort(naturalSort);

  return (
    <>
      <PageHeader
        title="QR ordering"
        description={
          outlet?.acceptsQrOrders === false
            ? 'QR ordering is switched off for this outlet'
            : 'Guests scan, browse and order to their table; orders land in the kitchen'
        }
        actions={
          <>
            <OutletPicker />
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={!rows.length}
            >
              <Printer /> Print all
            </Button>
            <Button size="sm" onClick={() => setAdding(true)} disabled={!outletId}>
              <Plus /> Add table
            </Button>
          </>
        }
      />
      {rows.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 print:grid-cols-3">
          {rows.map((t) => (
            <Card key={t.id} className="break-inside-avoid">
              <CardContent className="grid justify-items-center gap-2 pt-5 text-center">
                <p className="text-lg font-semibold">Table {t.label}</p>
                <div className="rounded-md bg-white p-2">
                  <QRCodeSVG
                    value={t.qrUrl}
                    size={128}
                    level="M"
                    aria-label={`QR code for table ${t.label}`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.seats} seats · {outlet?.name}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="print:hidden"
                  onClick={() => setRotating(t)}
                >
                  <RefreshCw /> New code
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title={tables.isLoading ? 'Loading tables…' : 'No tables yet'}
          description="Add a table to generate its QR code."
        />
      )}
      <AddTableDialog
        open={adding}
        outletId={outletId}
        invalidateKey={key}
        onClose={() => setAdding(false)}
      />
      <ConfirmDialog
        open={!!rotating}
        onOpenChange={(o) => (!o ? setRotating(null) : undefined)}
        title={`Replace the QR code for table ${rotating?.label}?`}
        description="The printed code stops working immediately. Use this if a code was copied or misused."
        confirmLabel="Issue new code"
        destructive
        loading={rotate.isPending}
        onConfirm={() => rotating && rotate.mutate(rotating.id)}
      />
    </>
  );
}

function AddTableDialog({
  open,
  outletId,
  invalidateKey,
  onClose,
}: {
  open: boolean;
  outletId: string | null;
  invalidateKey: string;
  onClose: () => void;
}) {
  const [label, setLabel] = React.useState('');
  const [seats, setSeats] = React.useState('4');
  const create = useApiMutation(
    () =>
      api.post(`merchant/outlets/${outletId}/tables`, {
        label: label.trim(),
        seats: Number(seats) || undefined,
      }),
    {
      invalidate: [invalidateKey],
      success: 'Table added',
      onSuccess: () => (setLabel(''), onClose()),
    },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add table</DialogTitle>
          <DialogDescription>A QR code is generated for the new table.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
          <Field label="Label">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={20}
              placeholder="e.g. T11 or Patio 2"
              required
            />
          </Field>
          <Field label="Seats">
            <Input inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={create.isPending}>
              Add table
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
