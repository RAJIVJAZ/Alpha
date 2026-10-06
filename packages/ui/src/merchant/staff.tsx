'use client';

import * as React from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '../components/button';
import { DataTable, type Column } from '../components/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Select } from '../components/form';
import { PageHeader } from '../components/layout';
import { Avatar } from '../components/misc';
import { StatusBadge } from '../components/status';
import { api } from '../lib/api';
import { formatRelative, humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';

interface Member {
  id: string;
  role: string;
  status: string;
  title: string | null;
  outletIds: string[];
  user: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    lastLoginAt: string | null;
  };
}

const ROLES = ['MANAGER', 'CHEF', 'CASHIER', 'STAFF', 'ACCOUNTANT', 'PROCUREMENT_MANAGER'] as const;
const ROLE_HELP: Record<string, string> = {
  OWNER: 'Everything, including approvals and payouts',
  MANAGER: 'Orders, menu, inventory and purchase orders (no approvals)',
  CHEF: 'Kitchen display and recipes',
  CASHIER: 'POS billing and orders',
  STAFF: 'Kitchen display',
  ACCOUNTANT: 'Reports, settlements and GST',
  PROCUREMENT_MANAGER: 'Inventory and purchase orders',
};

/** Staff management: invite by phone, change roles, revoke access. */
export function StaffManager() {
  const members = useApi<Member[]>('tenants/current/members');
  const [invite, setInvite] = React.useState(false);
  const update = useApiMutation(
    (v: { id: string; body: object }) => api.patch(`tenants/current/members/${v.id}`, v.body),
    { invalidate: ['tenants/current/members'], success: 'Staff updated' },
  );
  const columns: Column<Member>[] = [
    {
      key: 'name',
      header: 'Name',
      sortValue: (m) => m.user.name ?? '',
      cell: (m) => (
        <div className="flex items-center gap-3">
          <Avatar name={m.user.name ?? m.user.phone} />
          <div>
            <p className="font-medium">{m.user.name ?? 'Invited user'}</p>
            <p className="text-xs text-muted-foreground">{m.user.phone ?? m.user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (m) =>
        m.role === 'OWNER' ? (
          humanize(m.role)
        ) : (
          <Select
            aria-label={`Role of ${m.user.name}`}
            className="h-8 w-48"
            value={m.role}
            onChange={(e) => update.mutate({ id: m.id, body: { role: e.target.value } })}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </Select>
        ),
    },
    {
      key: 'access',
      header: 'Access',
      cell: (m) => <span className="text-sm text-muted-foreground">{ROLE_HELP[m.role]}</span>,
    },
    { key: 'status', header: 'Status', cell: (m) => <StatusBadge status={m.status} /> },
    { key: 'seen', header: 'Last active', cell: (m) => formatRelative(m.user.lastLoginAt) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (m) =>
        m.role === 'OWNER' ? null : m.status === 'ACTIVE' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => update.mutate({ id: m.id, body: { status: 'REVOKED' } })}
          >
            Revoke
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => update.mutate({ id: m.id, body: { status: 'ACTIVE' } })}
          >
            Restore
          </Button>
        ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Staff"
        description="Who can use this dashboard and what they can do"
        actions={
          <Button onClick={() => setInvite(true)}>
            <UserPlus /> Invite staff
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={members.data}
        getRowId={(m) => m.id}
        loading={members.isLoading}
        fetching={members.isFetching}
      />
      <InviteDialog open={invite} onClose={() => setInvite(false)} />
    </>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = React.useState({ phone: '', name: '', role: 'CHEF', title: '' });
  const send = useApiMutation(
    () => api.post('tenants/current/members', { ...form, title: form.title || undefined }),
    {
      invalidate: ['tenants/current/members'],
      success: 'Invitation sent',
      onSuccess: () => (setForm({ phone: '', name: '', role: 'CHEF', title: '' }), onClose()),
    },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite staff</DialogTitle>
          <DialogDescription>They sign in with this mobile number using an OTP.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), send.mutate())}>
          <Field label="Mobile number">
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
          </Field>
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Role" hint={ROLE_HELP[form.role]}>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </Select>
          </Field>
          <DialogFooter>
            <Button type="submit" loading={send.isPending}>
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
