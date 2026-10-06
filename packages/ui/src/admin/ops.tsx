'use client';

import * as React from 'react';
import {
  Bike,
  Search,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { DataTable, type Column } from '../components/data-table';
import { ConfirmDialog } from '../components/dialog';
import { Input, Select } from '../components/form';
import { FilterBar, PageHeader, StatGrid } from '../components/layout';
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/menu';
import { StatTile } from '../components/stat-tile';
import { StatusBadge } from '../components/status';
import { Badge } from '../components/badge';
import { api, type Paged } from '../lib/api';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatRelative,
  humanize,
} from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';

interface Rider {
  id: string;
  name: string;
  phone: string;
  city: string;
  status: string;
  vehicleType: string;
  vehicleNumber: string | null;
  rating: number;
  ratingCount: number;
  isOnline: boolean;
  isOnDelivery: boolean;
  acceptanceRate: number;
  totalDeliveries: number;
  lastLocationAt: string | null;
  createdAt: string;
  zone: { name: string } | null;
}
interface LiveRider {
  id: string;
  name: string;
  isOnDelivery: boolean;
  vehicleType: string;
  lat: number;
  lng: number;
  lastLocationAt: string | null;
}
interface Heatmap {
  generatedAt: string;
  cells: {
    geohash: string;
    lat: number;
    lng: number;
    demand: number;
    riders: number;
    pressure: number;
  }[];
  zones: { id: string; name: string; surge: number }[];
}
interface Incentive {
  id: string;
  name: string;
  description: string | null;
  type: string;
  city: string | null;
  target: number;
  rewardAmount: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  _count?: { progress: number };
}
interface Assessment {
  id: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  score: number;
  decision: string;
  reasons: string[];
  features: Record<string, unknown>;
  createdAt: string;
}

// ─── riders ──────────────────────────────────────────────────────────────────

/** Fleet operations: rider accounts, who's online right now, demand pressure and incentive schemes. */
export function RidersAdmin() {
  return (
    <>
      <PageHeader
        title="Riders"
        description="Fleet, live supply against demand, and incentives. New riders are approved in Approvals."
      />
      <Tabs defaultValue="fleet">
        <TabsList>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="live">Live supply</TabsTrigger>
          <TabsTrigger value="incentives">Incentives</TabsTrigger>
        </TabsList>
        <TabsContent value="fleet">
          <Fleet />
        </TabsContent>
        <TabsContent value="live">
          <Live />
        </TabsContent>
        <TabsContent value="incentives">
          <Incentives />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Fleet() {
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [online, setOnline] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [acting, setActing] = React.useState<Rider | null>(null);
  const list = useApi<Paged<Rider>>('admin/riders', {
    q: q || undefined,
    status: status || undefined,
    online: online || undefined,
    page,
    pageSize: 25,
  });
  const act = useApiMutation(
    (r: Rider) =>
      api.patch(`admin/riders/${r.id}`, {
        status: r.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
      }),
    {
      invalidate: ['admin/riders'],
      success: 'Rider updated',
      onSuccess: () => setActing(null),
    },
  );
  const columns: Column<Rider>[] = [
    {
      key: 'name',
      header: 'Rider',
      cell: (r) => (
        <div>
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted-foreground">
            {r.phone} · {r.zone?.name ?? r.city}
          </p>
        </div>
      ),
    },
    {
      key: 'veh',
      header: 'Vehicle',
      cell: (r) => (
        <div>
          <p className="text-sm">{humanize(r.vehicleType)}</p>
          <p className="font-mono text-xs text-muted-foreground">{r.vehicleNumber ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'del',
      header: 'Deliveries',
      align: 'right',
      sortValue: (r) => r.totalDeliveries,
      cell: (r) => formatNumber(r.totalDeliveries),
    },
    {
      key: 'rating',
      header: 'Rating',
      align: 'right',
      sortValue: (r) => r.rating,
      cell: (r) => (r.ratingCount ? `${r.rating.toFixed(1)} ★` : '—'),
    },
    {
      key: 'acc',
      header: 'Acceptance',
      align: 'right',
      cell: (r) => `${Math.round(r.acceptanceRate * (r.acceptanceRate <= 1 ? 100 : 1))}%`,
    },
    {
      key: 'now',
      header: 'Now',
      cell: (r) =>
        r.isOnDelivery ? (
          <StatusBadge status="IN_TRANSIT" label="On delivery" />
        ) : r.isOnline ? (
          <StatusBadge status="ACTIVE" label="Online" />
        ) : (
          <span className="text-sm text-muted-foreground">
            {r.lastLocationAt ? `Seen ${formatRelative(r.lastLocationAt)}` : 'Offline'}
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Account',
      cell: (r) => <StatusBadge status={r.status} label={humanize(r.status)} />,
    },
    {
      key: 'act',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (r) =>
        r.status === 'ACTIVE' || r.status === 'SUSPENDED' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActing(r)}
            aria-label={r.status === 'ACTIVE' ? `Suspend ${r.name}` : `Reinstate ${r.name}`}
          >
            {r.status === 'ACTIVE' ? <ShieldBan /> : <ShieldCheck />}
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <FilterBar>
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search riders</span>
          <Input
            className="w-56 pl-8"
            placeholder="Name or phone"
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(1))}
          />
        </label>
        <Select
          aria-label="Account status"
          className="w-44"
          value={status}
          onChange={(e) => (setStatus(e.target.value), setPage(1))}
        >
          <option value="">Any status</option>
          {['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED', 'OFFBOARDED'].map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Online"
          className="w-36"
          value={online}
          onChange={(e) => (setOnline(e.target.value), setPage(1))}
        >
          <option value="">Online or not</option>
          <option value="true">Online</option>
          <option value="false">Offline</option>
        </Select>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(r) => r.id}
        loading={list.isLoading}
        fetching={list.isFetching}
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
      <ConfirmDialog
        open={!!acting}
        onOpenChange={(o) => (!o ? setActing(null) : undefined)}
        title={
          acting?.status === 'ACTIVE' ? `Suspend ${acting?.name}?` : `Reinstate ${acting?.name}?`
        }
        description={
          acting?.status === 'ACTIVE'
            ? 'They are taken offline and stop receiving delivery offers.'
            : 'They can go online and take deliveries again.'
        }
        confirmLabel={acting?.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}
        destructive={acting?.status === 'ACTIVE'}
        loading={act.isPending}
        onConfirm={() => acting && act.mutate(acting)}
      />
    </>
  );
}

function Live() {
  const riders = useApi<LiveRider[]>('admin/riders/live', undefined, { refetchInterval: 15_000 });
  const heat = useApi<Heatmap>('admin/heatmap', undefined, { refetchInterval: 30_000 });
  const busy = (riders.data ?? []).filter((r) => r.isOnDelivery).length;
  const cells = [...(heat.data?.cells ?? [])].sort((a, b) => b.pressure - a.pressure);
  return (
    <div className="grid gap-4">
      <StatGrid>
        <StatTile
          label="Riders online"
          icon={<Bike />}
          value={riders.data ? formatNumber(riders.data.length) : '—'}
        />
        <StatTile label="On a delivery" value={riders.data ? formatNumber(busy) : '—'} />
        <StatTile
          label="Free"
          value={riders.data ? formatNumber(riders.data.length - busy) : '—'}
        />
        <StatTile
          label="Zones with surge"
          value={heat.data ? formatNumber(heat.data.zones.filter((z) => z.surge > 1).length) : '—'}
        />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Demand pressure by area</CardTitle>
            <CardDescription>
              Open orders per available rider in each ~1 km cell
              {heat.data ? ` · updated ${formatRelative(heat.data.generatedAt)}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm tabular">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">Cell</th>
                  <th className="py-2 pr-3 text-right font-medium">Orders</th>
                  <th className="py-2 pr-3 text-right font-medium">Riders</th>
                  <th className="py-2 pr-3 text-right font-medium">Per rider</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {cells.map((c) => (
                  <tr key={c.geohash} className="border-b last:border-0">
                    <td className="py-1.5 pr-3">
                      <a
                        className="font-mono text-xs text-primary hover:underline"
                        href={`https://maps.google.com/?q=${c.lat},${c.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c.geohash}
                      </a>
                    </td>
                    <td className="py-1.5 pr-3 text-right">{c.demand}</td>
                    <td className="py-1.5 pr-3 text-right">{c.riders}</td>
                    <td className="py-1.5 pr-3 text-right">{c.pressure}</td>
                    <td className="py-1.5">
                      {c.pressure >= 2 ? (
                        <StatusBadge status="HIGH" label="Short of riders" />
                      ) : c.pressure >= 1 ? (
                        <StatusBadge status="PENDING" label="Tight" />
                      ) : (
                        <StatusBadge status="ACTIVE" label="Covered" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {heat.data && !cells.length ? (
              <p className="py-4 text-sm text-muted-foreground">No open demand right now.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Online riders</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {(riders.data ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {humanize(r.vehicleType)} ·{' '}
                      {r.lastLocationAt
                        ? `ping ${formatRelative(r.lastLocationAt)}`
                        : 'no ping yet'}
                    </span>
                  </span>
                  {r.isOnDelivery ? (
                    <StatusBadge status="IN_TRANSIT" label="On delivery" />
                  ) : (
                    <StatusBadge status="ACTIVE" label="Free" />
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Incentives() {
  const list = useApi<Incentive[]>('admin/incentives');
  const toggle = useApiMutation(
    (i: Incentive) => api.patch(`admin/incentives/${i.id}`, { isActive: !i.isActive }),
    { invalidate: ['admin/incentives'] },
  );
  const columns: Column<Incentive>[] = [
    {
      key: 'name',
      header: 'Scheme',
      cell: (i) => (
        <div>
          <p className="font-medium">{i.name}</p>
          <p className="text-xs text-muted-foreground">{i.description}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (i) => humanize(i.type) },
    {
      key: 'goal',
      header: 'Target → reward',
      align: 'right',
      cell: (i) => `${i.target} → ${formatMoney(i.rewardAmount, { whole: true })}`,
    },
    {
      key: 'when',
      header: 'Runs',
      cell: (i) => `${formatDate(i.startsAt)} – ${formatDate(i.endsAt)}`,
    },
    { key: 'riders', header: 'Riders in it', align: 'right', cell: (i) => i._count?.progress ?? 0 },
    {
      key: 'on',
      header: 'Active',
      cell: (i) => (
        <Switch
          checked={i.isActive}
          onCheckedChange={() => toggle.mutate(i)}
          aria-label={`${i.isActive ? 'Pause' : 'Resume'} ${i.name}`}
        />
      ),
    },
  ];
  return (
    <DataTable columns={columns} rows={list.data} getRowId={(i) => i.id} loading={list.isLoading} />
  );
}

// ─── fraud ───────────────────────────────────────────────────────────────────

/** AI fraud detection review queue: orders and payments the model held for a person to check. */
export function FraudReview() {
  const [decision, setDecision] = React.useState('REVIEW');
  const [page, setPage] = React.useState(1);
  const stats = useApi<{
    last30Days: Record<string, number>;
    reviewOutcomes: Record<string, number>;
  }>('admin/ai/fraud/stats');
  const list = useApi<Paged<Assessment>>('admin/ai/fraud/assessments', { decision, page });
  const review = useApiMutation(
    (v: { id: string; outcome: 'CONFIRMED_FRAUD' | 'FALSE_POSITIVE' }) =>
      api.post(`admin/ai/fraud/assessments/${v.id}/review`, { outcome: v.outcome }),
    {
      invalidate: ['admin/ai/fraud'],
      success: 'Review recorded',
    },
  );
  const s = stats.data;
  const reviewed = Object.values(s?.reviewOutcomes ?? {}).reduce((a, b) => a + b, 0);
  const columns: Column<Assessment>[] = [
    {
      key: 'what',
      header: 'Flagged',
      cell: (a) => (
        <div>
          <p className="font-medium">{humanize(a.entityType)}</p>
          <p className="font-mono text-xs text-muted-foreground">{a.entityId.slice(0, 13)}</p>
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Risk',
      align: 'right',
      sortValue: (a) => a.score,
      cell: (a) => <span className="font-semibold tabular">{Math.round(a.score * 100)}</span>,
    },
    {
      key: 'why',
      header: 'Signals',
      cell: (a) => (
        <div className="flex flex-wrap gap-1">
          {a.reasons.map((r) => (
            <Badge key={r} variant="warning">
              {humanize(r)}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: 'when', header: 'When', cell: (a) => formatDateTime(a.createdAt) },
    {
      key: 'act',
      header: <span className="sr-only">Review</span>,
      align: 'right',
      cell: (a) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => review.mutate({ id: a.id, outcome: 'CONFIRMED_FRAUD' })}
            aria-label="Confirm fraud"
          >
            <ThumbsDown /> Fraud
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => review.mutate({ id: a.id, outcome: 'FALSE_POSITIVE' })}
            aria-label="False positive"
          >
            <ThumbsUp /> Legit
          </Button>
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Fraud review"
        description="Scored at checkout and payment; blocked orders never reach restaurants, held ones wait here"
      />
      <StatGrid>
        <StatTile
          label="Held for review (30 days)"
          icon={<ShieldAlert />}
          value={s ? formatNumber(s.last30Days.REVIEW ?? 0) : '—'}
        />
        <StatTile
          label="Blocked (30 days)"
          value={s ? formatNumber(s.last30Days.BLOCK ?? 0) : '—'}
        />
        <StatTile label="Reviewed" value={s ? formatNumber(reviewed) : '—'} />
        <StatTile
          label="Confirmed fraud"
          value={s ? formatNumber(s.reviewOutcomes.CONFIRMED_FRAUD ?? 0) : '—'}
        />
      </StatGrid>
      <FilterBar className="mt-6">
        <Select
          aria-label="Decision"
          className="w-44"
          value={decision}
          onChange={(e) => (setDecision(e.target.value), setPage(1))}
        >
          <option value="REVIEW">Held for review</option>
          <option value="BLOCK">Blocked</option>
        </Select>
        <span className="text-sm text-muted-foreground">Unreviewed only, highest risk first</span>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(a) => a.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        empty={{ title: 'Queue is clear' }}
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
