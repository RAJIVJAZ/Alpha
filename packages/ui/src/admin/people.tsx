'use client';

import * as React from 'react';
import {
  CheckCircle2,
  FileText,
  MessageSquareWarning,
  Search,
  ShieldBan,
  ShieldCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { Button } from '../components/button';
import { DataTable, type Column } from '../components/data-table';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SheetContent,
} from '../components/dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { FilterBar, PageHeader } from '../components/layout';
import { Tabs, TabsList, TabsTrigger } from '../components/menu';
import { StatusBadge } from '../components/status';
import { Badge } from '../components/badge';
import { api, type Paged } from '../lib/api';
import { formatDate, formatDateTime, formatRelative, humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import type { AdminTenant, AdminUser, Approval, CommissionRule } from './types';

const PLATFORM_ROLES = ['CUSTOMER', 'RIDER', 'ADMIN', 'SUPPORT', 'FINANCE', 'OPS'] as const;
const STAFF_ROLES = ['ADMIN', 'SUPPORT', 'FINANCE', 'OPS'] as const;
const TENANT_TYPES = ['RESTAURANT', 'FOOD_CART', 'SUPPLIER', 'WHOLESALER', 'RETAILER'] as const;

// ─── users ───────────────────────────────────────────────────────────────────

/** Every account on the platform: customers, riders, merchants' staff and back office. */
export function UsersAdmin() {
  const [q, setQ] = React.useState('');
  const [role, setRole] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [blocking, setBlocking] = React.useState<AdminUser | null>(null);
  const [roles, setRoles] = React.useState<AdminUser | null>(null);
  const [staff, setStaff] = React.useState(false);
  const list = useApi<Paged<AdminUser>>('admin/users', {
    q: q || undefined,
    role: role || undefined,
    status: status || undefined,
    page,
    pageSize: 25,
  });

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'User',
      cell: (u) => (
        <div>
          <p className="font-medium">{u.name ?? 'Unnamed'}</p>
          <p className="text-xs text-muted-foreground">
            {[u.phone, u.email].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <Badge key={r} variant="neutral">
              {humanize(r)}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: 'joined', header: 'Joined', cell: (u) => formatDate(u.createdAt) },
    {
      key: 'login',
      header: 'Last sign-in',
      cell: (u) => (u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Never'),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (u) => <StatusBadge status={u.status} label={humanize(u.status)} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (u) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setRoles(u)}>
            Roles
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setBlocking(u)}
            aria-label={u.status === 'BLOCKED' ? `Unblock ${u.name}` : `Block ${u.name}`}
          >
            {u.status === 'BLOCKED' ? <ShieldCheck /> : <ShieldBan />}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description={
          list.data ? `${list.data.meta.total.toLocaleString('en-IN')} accounts` : undefined
        }
        actions={
          <Button size="sm" onClick={() => setStaff(true)}>
            <UserPlus /> Add back-office staff
          </Button>
        }
      />
      <FilterBar>
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search users</span>
          <Input
            className="w-64 pl-8"
            placeholder="Name, phone or email"
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(1))}
          />
        </label>
        <Select
          aria-label="Role"
          className="w-40"
          value={role}
          onChange={(e) => (setRole(e.target.value), setPage(1))}
        >
          <option value="">Any role</option>
          {PLATFORM_ROLES.map((r) => (
            <option key={r} value={r}>
              {humanize(r)}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          className="w-36"
          value={status}
          onChange={(e) => (setStatus(e.target.value), setPage(1))}
        >
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="BLOCKED">Blocked</option>
        </Select>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(u) => u.id}
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
      <BlockDialog user={blocking} onClose={() => setBlocking(null)} />
      {roles ? <RolesDialog user={roles} onClose={() => setRoles(null)} /> : null}
      {staff ? <StaffDialog onClose={() => setStaff(false)} /> : null}
    </>
  );
}

function BlockDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [reason, setReason] = React.useState('');
  const blocked = user?.status === 'BLOCKED';
  const save = useApiMutation(
    () =>
      api.patch(`admin/users/${user!.id}/status`, {
        status: blocked ? 'ACTIVE' : 'BLOCKED',
        reason: reason || undefined,
      }),
    {
      invalidate: ['admin/users'],
      success: blocked ? 'User unblocked' : 'User blocked; their sessions are revoked',
      onSuccess: () => (setReason(''), onClose()),
    },
  );
  return (
    <ConfirmDialog
      open={!!user}
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={
        blocked ? `Unblock ${user?.name ?? 'this user'}?` : `Block ${user?.name ?? 'this user'}?`
      }
      description={
        blocked
          ? 'They can sign in again.'
          : 'Active sessions end immediately and they cannot sign in.'
      }
      confirmLabel={blocked ? 'Unblock' : 'Block user'}
      destructive={!blocked}
      loading={save.isPending}
      onConfirm={() => save.mutate()}
    >
      <Field label="Reason (kept in the audit log)">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ConfirmDialog>
  );
}

function RolesDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [roles, setRoles] = React.useState<string[]>(user.roles);
  const save = useApiMutation(() => api.patch(`admin/users/${user.id}/roles`, { roles }), {
    invalidate: ['admin/users'],
    success: 'Roles updated',
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Roles for {user.name ?? user.phone ?? user.email}</DialogTitle>
          <DialogDescription>
            Platform roles. Business roles (owner, chef, cashier…) are managed by each business.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORM_ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--primary)]"
                checked={roles.includes(r)}
                onChange={() =>
                  setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])
                }
              />
              {humanize(r)}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!roles.length}>
            Save roles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StaffDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = React.useState({
    name: '',
    email: '',
    password: '',
    roles: ['SUPPORT'] as string[],
  });
  const save = useApiMutation(() => api.post('admin/staff', f), {
    invalidate: ['admin/users'],
    success: `${f.name} can now sign in to the console`,
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add back-office staff</DialogTitle>
          <DialogDescription>
            Staff sign in to this console with email and password.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Field label="Name">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </Field>
          <Field label="Work email">
            <Input
              type="email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Temporary password" hint="At least 8 characters; ask them to change it">
            <Input
              type="password"
              minLength={8}
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              required
              autoComplete="new-password"
            />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Access</legend>
            <div className="grid grid-cols-2 gap-2">
              {STAFF_ROLES.map((r) => (
                <label
                  key={r}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--primary)]"
                    checked={f.roles.includes(r)}
                    onChange={() =>
                      setF({
                        ...f,
                        roles: f.roles.includes(r)
                          ? f.roles.filter((x) => x !== r)
                          : [...f.roles, r],
                      })
                    }
                  />
                  {humanize(r)}
                </label>
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="submit" loading={save.isPending} disabled={!f.roles.length}>
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── businesses ──────────────────────────────────────────────────────────────

/**
 * Restaurants, food carts, suppliers, wholesalers and retailers. `commission` shows and
 * edits each business's commission rule (finance staff only).
 */
export function TenantsAdmin({ commission = false }: { commission?: boolean }) {
  const [type, setType] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<AdminTenant | null>(null);
  const list = useApi<Paged<AdminTenant>>('admin/tenants', {
    type: type || undefined,
    status: status || undefined,
    q: q || undefined,
    page,
    pageSize: 25,
  });
  const rules = useApi<CommissionRule[]>(commission ? 'admin/commission-rules' : null);
  const columns: Column<AdminTenant>[] = [
    {
      key: 'name',
      header: 'Business',
      cell: (t) => (
        <div>
          <p className="font-medium">{t.name}</p>
          <p className="text-xs text-muted-foreground">{t.legalName ?? ''}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (t) => humanize(t.type) },
    { key: 'city', header: 'City', cell: (t) => t.city ?? '—' },
    {
      key: 'gstin',
      header: 'GSTIN',
      cell: (t) => <span className="font-mono text-xs">{t.gstin ?? '—'}</span>,
    },
    {
      key: 'comm',
      header: 'Commission',
      align: 'right',
      cell: (t) => {
        const rule = businessRule(rules.data, t.id);
        return rule ? `${Number(rule.ratePct)}%` : 'Default';
      },
    },
    { key: 'since', header: 'Joined', cell: (t) => formatDate(t.createdAt) },
    {
      key: 'status',
      header: 'Status',
      cell: (t) => <StatusBadge status={t.status} label={humanize(t.status)} />,
    },
  ];
  return (
    <>
      <PageHeader title="Businesses" description="Merchants and sellers on the platform" />
      <FilterBar>
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search businesses</span>
          <Input
            className="w-56 pl-8"
            placeholder="Name or GSTIN"
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(1))}
          />
        </label>
        <Select
          aria-label="Type"
          className="w-40"
          value={type}
          onChange={(e) => (setType(e.target.value), setPage(1))}
        >
          <option value="">All types</option>
          {TENANT_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          className="w-44"
          value={status}
          onChange={(e) => (setStatus(e.target.value), setPage(1))}
        >
          <option value="">Any status</option>
          {['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED', 'REJECTED'].map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </FilterBar>
      <DataTable
        columns={commission ? columns : columns.filter((c) => c.key !== 'comm')}
        rows={list.data?.data}
        getRowId={(t) => t.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        onRowClick={setOpen}
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
      <Dialog open={!!open} onOpenChange={(o) => (!o ? setOpen(null) : undefined)}>
        <SheetContent side="right" className="w-full max-w-lg" aria-describedby={undefined}>
          {open ? (
            <TenantPanel tenant={open} rules={rules.data} onDone={() => setOpen(null)} />
          ) : null}
        </SheetContent>
      </Dialog>
    </>
  );
}

/**
 * The business-wide commission rule settlements apply to this business (an outlet rule
 * still wins for its outlet), mirroring payment-service's resolveCommissionRule.
 */
function businessRule(rules: CommissionRule[] | undefined, tenantId: string) {
  const now = Date.now();
  return rules
    ?.filter(
      (r) =>
        r.isActive &&
        r.tenantId === tenantId &&
        !r.outletId &&
        Date.parse(r.effectiveFrom) <= now &&
        (!r.effectiveTo || Date.parse(r.effectiveTo) > now),
    )
    .sort((a, b) => b.priority - a.priority)[0];
}

/** Saves the override as that business's commission rule in payment-service. */
function CommissionForm({
  tenant: t,
  rules,
  onDone,
}: {
  tenant: AdminTenant;
  rules: CommissionRule[];
  onDone: () => void;
}) {
  const rule = businessRule(rules, t.id);
  const [rate, setRate] = React.useState(rule ? String(Number(rule.ratePct)) : '');
  const save = useApiMutation(
    () => {
      const ratePct = Number(rate);
      return rule
        ? api.patch(`admin/commission-rules/${rule.id}`, { ratePct })
        : api.post('admin/commission-rules', {
            name: 'Business override',
            tenantId: t.id,
            ratePct,
          });
    },
    {
      invalidate: ['admin/commission-rules'],
      success: `${t.name} commission saved`,
      onSuccess: onDone,
    },
  );
  return (
    <form
      className="grid gap-3 border-t pt-4"
      onSubmit={(e) => (e.preventDefault(), save.mutate())}
    >
      <Field
        label="Commission (%)"
        hint="Overrides the default rule for this business; applies to orders settled from now on"
      >
        <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
      </Field>
      <Button type="submit" variant="outline" loading={save.isPending} disabled={!rate}>
        Save commission
      </Button>
    </form>
  );
}

function TenantPanel({
  tenant: t,
  rules,
  onDone,
}: {
  tenant: AdminTenant;
  /** Commission rules, when the viewer may manage them and they have loaded. */
  rules?: CommissionRule[];
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState('');
  const save = useApiMutation(
    (body: Record<string, unknown>) => api.patch(`admin/tenants/${t.id}`, body),
    { invalidate: ['admin/tenants'], success: `${t.name} updated`, onSuccess: onDone },
  );
  const facts: [string, React.ReactNode][] = [
    ['Type', humanize(t.type)],
    ['Legal name', t.legalName],
    ['GSTIN', t.gstin],
    ['PAN', t.pan],
    ['FSSAI', t.fssaiLicense],
    ['Contact', [t.phone, t.email].filter(Boolean).join(' · ')],
    ['Address', [t.addressLine1, t.city, t.state, t.pincode].filter(Boolean).join(', ')],
    ['Approved', t.approvedAt ? formatDate(t.approvedAt) : '—'],
  ];
  return (
    <div className="grid gap-5">
      <div className="pr-8">
        <DialogTitle>{t.name}</DialogTitle>
        <p className="mt-1">
          <StatusBadge status={t.status} label={humanize(t.status)} />
        </p>
      </div>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
        {facts.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v || '—'}</dd>
          </React.Fragment>
        ))}
      </dl>
      <Documents docs={t.kycDocuments} />
      {rules ? <CommissionForm tenant={t} rules={rules} onDone={onDone} /> : null}
      {t.status === 'ACTIVE' || t.status === 'SUSPENDED' ? (
        <div className="grid gap-3 border-t pt-4">
          <Field label="Reason">
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.status === 'ACTIVE' ? 'e.g. repeated food safety complaints' : ''}
            />
          </Field>
          {t.status === 'ACTIVE' ? (
            <Button
              variant="destructive"
              onClick={() => save.mutate({ status: 'SUSPENDED', reason: reason || undefined })}
              disabled={!reason}
              loading={save.isPending && save.variables?.status === 'SUSPENDED'}
            >
              Suspend business
            </Button>
          ) : (
            <Button
              onClick={() => save.mutate({ status: 'ACTIVE', reason: reason || undefined })}
              loading={save.isPending && save.variables?.status === 'ACTIVE'}
            >
              Reinstate business
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Documents({ docs }: { docs: AdminTenant['kycDocuments'] | Approval['documents'] }) {
  if (!docs?.length) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Documents</h3>
      <ul className="grid gap-1.5 text-sm">
        {docs.map((d, i) => (
          <li
            key={`${d.type}-${i}`}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
          >
            <span className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" aria-hidden />
              {humanize(d.type)}
              {d.number ? (
                <span className="font-mono text-xs text-muted-foreground">{d.number}</span>
              ) : null}
            </span>
            {d.verified ? (
              <StatusBadge status="APPROVED" label="Verified" />
            ) : d.url ? (
              <span
                className="max-w-48 truncate font-mono text-xs text-muted-foreground"
                title={d.url}
              >
                {d.url}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── approvals ───────────────────────────────────────────────────────────────

const ENTITY_LABEL: Record<string, string> = {
  TENANT: 'Businesses',
  RIDER: 'Riders',
  AD_CAMPAIGN: 'Ad campaigns',
  OUTLET: 'Outlets',
};

/** Onboarding and review queue: restaurants, suppliers and other businesses, riders, ad campaigns. */
export function ApprovalsQueue({ initialType = '' }: { initialType?: string }) {
  const [type, setType] = React.useState(initialType);
  const [status, setStatus] = React.useState('PENDING');
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<Approval | null>(null);
  const list = useApi<Paged<Approval>>('admin/approvals', {
    entityType: type || undefined,
    status: status || undefined,
    page,
    pageSize: 25,
  });
  const columns: Column<Approval>[] = [
    {
      key: 'title',
      header: 'Request',
      cell: (a) => <span className="font-medium">{a.title}</span>,
    },
    {
      key: 'type',
      header: 'Kind',
      cell: (a) => (a.entityType === 'TENANT' ? 'Business' : humanize(a.entityType)),
    },
    { key: 'docs', header: 'Documents', align: 'right', cell: (a) => a.documents?.length ?? 0 },
    { key: 'when', header: 'Submitted', cell: (a) => formatRelative(a.createdAt) },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => <StatusBadge status={a.status} label={humanize(a.status)} />,
    },
  ];
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Business, rider and ad reviews; approving activates the account or campaign"
      />
      <Tabs value={type} onValueChange={(v) => (setType(v), setPage(1))}>
        <TabsList className="mb-3 flex-wrap">
          <TabsTrigger value="">All</TabsTrigger>
          {Object.entries(ENTITY_LABEL).map(([k, v]) => (
            <TabsTrigger key={k} value={k}>
              {v}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <FilterBar>
        <Select
          aria-label="Status"
          className="w-48"
          value={status}
          onChange={(e) => (setStatus(e.target.value), setPage(1))}
        >
          <option value="">Any status</option>
          {['PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'].map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data?.data}
        getRowId={(a) => a.id}
        loading={list.isLoading}
        fetching={list.isFetching}
        onRowClick={setOpen}
        empty={{ title: 'Nothing to review', description: 'New applications appear here.' }}
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
      <Dialog open={!!open} onOpenChange={(o) => (!o ? setOpen(null) : undefined)}>
        <SheetContent side="right" className="w-full max-w-lg" aria-describedby={undefined}>
          {open ? <ApprovalPanel id={open.id} onDone={() => setOpen(null)} /> : null}
        </SheetContent>
      </Dialog>
    </>
  );
}

function ApprovalPanel({ id, onDone }: { id: string; onDone: () => void }) {
  const a = useApi<Approval & { tenant?: AdminTenant | null }>(`admin/approvals/${id}`).data;
  const [notes, setNotes] = React.useState('');
  const decide = useApiMutation(
    (decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED') =>
      api.post(`admin/approvals/${id}/decision`, { decision, notes: notes || undefined }),
    {
      invalidate: ['admin/approvals', 'admin/stats', 'admin/tenants', 'admin/riders'],
      success: (r) => `Marked ${humanize((r as Approval).status).toLowerCase()}`,
      onSuccess: onDone,
    },
  );
  if (!a) return <DialogTitle className="sr-only">Loading request</DialogTitle>;
  const open = a.status === 'PENDING' || a.status === 'CHANGES_REQUESTED';
  const meta = Object.entries(a.metadata ?? {}).filter(
    ([, v]) => v !== null && typeof v !== 'object',
  );
  return (
    <div className="grid gap-5">
      <div className="pr-8">
        <DialogTitle>{a.title}</DialogTitle>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={a.status} label={humanize(a.status)} /> {humanize(a.entityType)} ·
          submitted {formatDateTime(a.createdAt)}
        </p>
      </div>
      {a.tenant ? (
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Business</dt>
          <dd>
            {a.tenant.name} ({humanize(a.tenant.type)})
          </dd>
          <dt className="text-muted-foreground">GSTIN</dt>
          <dd className="font-mono text-xs">{a.tenant.gstin ?? '—'}</dd>
          <dt className="text-muted-foreground">FSSAI</dt>
          <dd className="font-mono text-xs">{a.tenant.fssaiLicense ?? '—'}</dd>
          <dt className="text-muted-foreground">City</dt>
          <dd>{a.tenant.city ?? '—'}</dd>
        </dl>
      ) : null}
      {meta.length ? (
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
          {meta.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-muted-foreground">{humanize(k.replace(/([A-Z])/g, '_$1'))}</dt>
              <dd className="break-all">{String(v)}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
      <Documents docs={a.documents} />
      {a.reviewNotes ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Review notes: </span>
          {a.reviewNotes}
        </p>
      ) : null}
      {open ? (
        <div className="grid gap-3 border-t pt-4">
          <Field label="Notes to the applicant">
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Required when rejecting or asking for changes"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => decide.mutate('APPROVED')}
              loading={decide.isPending && decide.variables === 'APPROVED'}
            >
              <CheckCircle2 /> Approve
            </Button>
            <Button
              variant="outline"
              onClick={() => decide.mutate('CHANGES_REQUESTED')}
              disabled={!notes}
              loading={decide.isPending && decide.variables === 'CHANGES_REQUESTED'}
            >
              <MessageSquareWarning /> Ask for changes
            </Button>
            <Button
              variant="destructive"
              onClick={() => decide.mutate('REJECTED')}
              disabled={!notes}
              loading={decide.isPending && decide.variables === 'REJECTED'}
            >
              <XCircle /> Reject
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
