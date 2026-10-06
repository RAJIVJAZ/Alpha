'use client';

import * as React from 'react';
import { AlarmClock, Check, Play, RotateCcw } from 'lucide-react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { EmptyState, FilterBar, PageHeader } from '../components/layout';
import { Tabs, TabsList, TabsTrigger } from '../components/menu';
import { api } from '../lib/api';
import { humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { cn } from '../lib/utils';
import { OutletPicker, useOutlet } from './outlet';
import type { KitchenTicket } from './types';

const SLA_WARN = 12 * 60;
const SLA_LATE = 20 * 60;

function elapsedLabel(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Kitchen display: tickets per station, oldest first, with SLA timers. */
export function KitchenDisplay() {
  const { outletId } = useOutlet();
  const [station, setStation] = React.useState('ALL');
  const tickets = useApi<KitchenTicket[]>(outletId ? 'kds/tickets' : null, { outletId: outletId ?? undefined, station: station === 'ALL' ? undefined : station }, { refetchInterval: 5_000 });
  // re-render every second so timers count up between refetches
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const fetchedAt = tickets.dataUpdatedAt;
  const stations = [...new Set((tickets.data ?? []).map((t) => t.station))].sort();
  const columns: { key: KitchenTicket['status']; label: string }[] = [
    { key: 'QUEUED', label: 'Queued' },
    { key: 'IN_PROGRESS', label: 'Cooking' },
    { key: 'READY', label: 'Ready to serve' },
  ];
  return (
    <>
      <PageHeader title="Kitchen display" description="Tickets refresh every 5 seconds" actions={<OutletPicker />} />
      <FilterBar>
        <Tabs value={station} onValueChange={setStation}>
          <TabsList>
            <TabsTrigger value="ALL">All stations</TabsTrigger>
            {stations.map((s) => (
              <TabsTrigger key={s} value={s}>
                {humanize(s)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </FilterBar>
      {tickets.data && tickets.data.length === 0 ? (
        <EmptyState title="Kitchen is clear" description="Accepted orders appear here as tickets, one per station." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {columns.map((col) => {
            const list = (tickets.data ?? []).filter((t) => t.status === col.key).sort((a, b) => b.elapsedSeconds - a.elapsedSeconds);
            return (
              <section key={col.key} aria-label={col.label} className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  {col.label} <Badge variant="neutral">{list.length}</Badge>
                </h2>
                {list.map((t) => (
                  <TicketCard key={t.id} ticket={t} elapsed={t.elapsedSeconds + Math.max(0, Math.floor((now - fetchedAt) / 1000))} />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function TicketCard({ ticket, elapsed }: { ticket: KitchenTicket; elapsed: number }) {
  const act = useApiMutation((action: string) => api.post(`kds/tickets/${ticket.id}/${action}`), { invalidate: ['kds/', 'merchant/orders'] });
  const late = elapsed >= SLA_LATE;
  const warn = !late && elapsed >= SLA_WARN && ticket.status !== 'READY';
  return (
    <Card className={cn('p-4', late && ticket.status !== 'READY' && 'border-status-critical/50')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">#{ticket.ticketNumber}</p>
          <p className="text-xs text-muted-foreground">
            {ticket.orderNumber} · {humanize(ticket.orderType)} · {humanize(ticket.station)}
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-1 text-sm font-medium tabular', late && ticket.status !== 'READY' ? 'text-status-critical' : warn ? 'text-foreground' : 'text-muted-foreground')}>
          <AlarmClock className="size-4" aria-hidden />
          {elapsedLabel(elapsed)}
          {late && ticket.status !== 'READY' ? <span className="sr-only"> (late)</span> : null}
        </span>
      </div>
      <ul className="my-3 grid gap-1 text-sm">
        {ticket.items.map((i, idx) => (
          <li key={idx}>
            <span className="font-semibold tabular">{i.quantity}×</span> {i.name}
            {i.variant || i.addons.length ? <span className="text-muted-foreground"> · {[i.variant, ...i.addons].filter(Boolean).join(', ')}</span> : null}
            {i.notes ? <p className="text-xs">Note: {i.notes}</p> : null}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        {ticket.status === 'QUEUED' ? (
          <Button size="sm" loading={act.isPending} onClick={() => act.mutate('start')}>
            <Play /> Start
          </Button>
        ) : null}
        {ticket.status === 'IN_PROGRESS' ? (
          <Button size="sm" loading={act.isPending} onClick={() => act.mutate('ready')}>
            <Check /> Ready
          </Button>
        ) : null}
        {ticket.status === 'READY' ? (
          <>
            <Button size="sm" loading={act.isPending} onClick={() => act.mutate('bump')}>
              <Check /> Served
            </Button>
            <Button size="sm" variant="outline" onClick={() => act.mutate('recall')}>
              <RotateCcw /> Recall
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}
