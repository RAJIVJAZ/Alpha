'use client';

import * as React from 'react';
import { Pencil, Plus, Send, Trash2, XCircle } from 'lucide-react';
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
} from '../components/dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { FilterBar, PageHeader } from '../components/layout';
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/menu';
import { StatusBadge } from '../components/status';
import { Thumb } from '../components/thumb';
import { api } from '../lib/api';
import { formatDateTime, formatNumber, formatPercent, humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { MarketplaceCategories } from './categories';

interface Campaign {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  deepLink: string | null;
  app: 'CUSTOMER' | 'RIDER' | 'MERCHANT' | 'ADMIN';
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  openCount: number;
  createdAt: string;
}
interface CmsPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  audience: string;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  updatedAt: string;
}
interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  placement: string;
  audience: string;
  cities: string[];
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

const AUDIENCES = ['ALL', 'CUSTOMER', 'MERCHANT', 'RIDER', 'SUPPLIER'] as const;
const PLACEMENTS = [
  'HOME_HERO',
  'HOME_STRIP',
  'OFFERS',
  'MARKETPLACE_TOP',
  'RIDER_HOME',
  'MERCHANT_HOME',
];

// ─── push notifications ──────────────────────────────────────────────────────

/** Push notification management: compose, schedule, send and track campaigns. */
export function PushCampaigns() {
  const list = useApi<Campaign[]>('admin/push-campaigns');
  const [composing, setComposing] = React.useState(false);
  const [sending, setSending] = React.useState<Campaign | null>(null);
  const send = useApiMutation((id: string) => api.post(`admin/push-campaigns/${id}/send`), {
    invalidate: ['admin/push-campaigns'],
    success: 'Sending started',
    onSuccess: () => setSending(null),
  });
  const cancel = useApiMutation((id: string) => api.post(`admin/push-campaigns/${id}/cancel`), {
    invalidate: ['admin/push-campaigns'],
    success: 'Campaign cancelled',
  });
  const columns: Column<Campaign>[] = [
    {
      key: 'msg',
      header: 'Message',
      cell: (c) => (
        <div className="max-w-md">
          <p className="font-medium">{c.title}</p>
          <p className="truncate text-xs text-muted-foreground">{c.body}</p>
        </div>
      ),
    },
    { key: 'app', header: 'App', cell: (c) => humanize(c.app) },
    {
      key: 'when',
      header: 'When',
      cell: (c) => formatDateTime(c.sentAt ?? c.scheduledAt ?? c.createdAt),
    },
    {
      key: 'reach',
      header: 'Delivered',
      align: 'right',
      cell: (c) =>
        c.sentAt ? `${formatNumber(c.sentCount)} / ${formatNumber(c.targetCount)}` : '—',
    },
    {
      key: 'open',
      header: 'Opened',
      align: 'right',
      cell: (c) => (c.sentCount ? formatPercent((c.openCount / c.sentCount) * 100) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => <StatusBadge status={c.status} label={humanize(c.status)} />,
    },
    {
      key: 'act',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (c) =>
        c.status === 'DRAFT' || c.status === 'SCHEDULED' ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={() => setSending(c)}>
              <Send /> Send now
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => cancel.mutate(c.id)}
              aria-label={`Cancel ${c.title}`}
            >
              <XCircle />
            </Button>
          </div>
        ) : null,
    },
  ];
  return (
    <>
      <PageHeader
        title="Push notifications"
        description="Campaigns to customers, riders and merchants; transactional pushes (order updates) are automatic"
        actions={
          <Button size="sm" onClick={() => setComposing(true)}>
            <Plus /> New campaign
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={list.data}
        getRowId={(c) => c.id}
        loading={list.isLoading}
        empty={{ title: 'No campaigns yet' }}
      />
      {composing ? <ComposeDialog onClose={() => setComposing(false)} /> : null}
      <ConfirmDialog
        open={!!sending}
        onOpenChange={(o) => (!o ? setSending(null) : undefined)}
        title={`Send "${sending?.title}" now?`}
        description={`Everyone with the ${humanize(sending?.app ?? '').toLowerCase()} app receives it (quiet hours are respected). This can't be undone.`}
        confirmLabel="Send now"
        loading={send.isPending}
        onConfirm={() => sending && send.mutate(sending.id)}
      />
    </>
  );
}

function ComposeDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = React.useState({
    title: '',
    body: '',
    app: 'CUSTOMER',
    deepLink: '',
    imageUrl: '',
    scheduledAt: '',
  });
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });
  const save = useApiMutation(
    () =>
      api.post('admin/push-campaigns', {
        title: f.title.trim(),
        body: f.body.trim(),
        app: f.app,
        deepLink: f.deepLink || undefined,
        imageUrl: f.imageUrl || undefined,
        scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : undefined,
      }),
    {
      invalidate: ['admin/push-campaigns'],
      success: f.scheduledAt ? 'Campaign scheduled' : 'Draft saved; send it from the list',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New push campaign</DialogTitle>
          <DialogDescription>
            Keep titles under 50 characters so they aren't cut off on the lock screen.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Field label="App">
            <Select value={f.app} onChange={set('app')}>
              {['CUSTOMER', 'RIDER', 'MERCHANT'].map((a) => (
                <option key={a} value={a}>
                  {humanize(a)} app
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Title (${f.title.length}/80)`}>
            <Input value={f.title} onChange={set('title')} maxLength={80} required />
          </Field>
          <Field label={`Message (${f.body.length}/240)`}>
            <Textarea rows={3} value={f.body} onChange={set('body')} maxLength={240} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Deep link" hint="e.g. foodgrid://offers">
              <Input value={f.deepLink} onChange={set('deepLink')} />
            </Field>
            <Field label="Image URL">
              <Input type="url" value={f.imageUrl} onChange={set('imageUrl')} />
            </Field>
          </div>
          <Field label="Schedule (IST)" hint="Leave empty to save a draft and send manually">
            <Input type="datetime-local" value={f.scheduledAt} onChange={set('scheduledAt')} />
          </Field>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-1 text-xs text-muted-foreground">Preview</p>
            <p className="text-sm font-semibold">{f.title || 'Title'}</p>
            <p className="text-sm text-muted-foreground">{f.body || 'Message'}</p>
          </div>
          <DialogFooter>
            <Button type="submit" loading={save.isPending}>
              {f.scheduledAt ? 'Schedule' : 'Save draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── CMS ─────────────────────────────────────────────────────────────────────

/** CMS: static pages (terms, privacy, FAQs) and promotional banners. */
export function ContentManager() {
  return (
    <>
      <PageHeader
        title="Content"
        description="Pages, banners and marketplace categories shown in the apps"
      />
      <Tabs defaultValue="banners">
        <TabsList>
          <TabsTrigger value="banners">Banners</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="categories">Marketplace categories</TabsTrigger>
        </TabsList>
        <TabsContent value="banners">
          <Banners />
        </TabsContent>
        <TabsContent value="pages">
          <Pages />
        </TabsContent>
        <TabsContent value="categories">
          <MarketplaceCategories />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Banners() {
  const list = useApi<Banner[]>('admin/cms/banners');
  const [editing, setEditing] = React.useState<Banner | 'new' | null>(null);
  const [removing, setRemoving] = React.useState<Banner | null>(null);
  const toggle = useApiMutation(
    (b: Banner) => api.patch(`admin/cms/banners/${b.id}`, { isActive: !b.isActive }),
    { invalidate: ['admin/cms/banners'] },
  );
  const remove = useApiMutation((id: string) => api.delete(`admin/cms/banners/${id}`), {
    invalidate: ['admin/cms/banners'],
    success: 'Banner deleted',
    onSuccess: () => setRemoving(null),
  });
  const columns: Column<Banner>[] = [
    {
      key: 'img',
      header: <span className="sr-only">Image</span>,
      cell: (b) => <Thumb src={b.imageUrl} className="h-10 w-20" />,
    },
    {
      key: 'title',
      header: 'Banner',
      cell: (b) => (
        <div>
          <p className="font-medium">{b.title}</p>
          <p className="text-xs text-muted-foreground">{b.subtitle}</p>
        </div>
      ),
    },
    { key: 'where', header: 'Placement', cell: (b) => humanize(b.placement) },
    {
      key: 'who',
      header: 'Audience',
      cell: (b) => `${humanize(b.audience)}${b.cities.length ? ` · ${b.cities.join(', ')}` : ''}`,
    },
    { key: 'order', header: 'Order', align: 'right', cell: (b) => b.sortOrder },
    {
      key: 'live',
      header: 'Live',
      cell: (b) => (
        <Switch
          checked={b.isActive}
          onCheckedChange={() => toggle.mutate(b)}
          aria-label={`${b.isActive ? 'Hide' : 'Show'} ${b.title}`}
        />
      ),
    },
    {
      key: 'act',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (b) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(b)}
            aria-label={`Edit ${b.title}`}
          >
            <Pencil />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRemoving(b)}
            aria-label={`Delete ${b.title}`}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];
  return (
    <>
      <FilterBar>
        <Button size="sm" className="ml-auto" onClick={() => setEditing('new')}>
          <Plus /> New banner
        </Button>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data}
        getRowId={(b) => b.id}
        loading={list.isLoading}
      />
      {editing ? (
        <BannerDialog
          banner={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => (!o ? setRemoving(null) : undefined)}
        title={`Delete "${removing?.title}"?`}
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </>
  );
}

function BannerDialog({ banner: b, onClose }: { banner: Banner | null; onClose: () => void }) {
  const [f, setF] = React.useState({
    title: b?.title ?? '',
    subtitle: b?.subtitle ?? '',
    imageUrl: b?.imageUrl ?? '',
    linkUrl: b?.linkUrl ?? '',
    placement: b?.placement ?? 'HOME_HERO',
    audience: b?.audience ?? 'CUSTOMER',
    cities: b?.cities.join(', ') ?? '',
    sortOrder: String(b?.sortOrder ?? 0),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const save = useApiMutation(
    () => {
      const body = {
        ...f,
        subtitle: f.subtitle || undefined,
        linkUrl: f.linkUrl || undefined,
        cities: f.cities
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        sortOrder: Number(f.sortOrder) || 0,
      };
      return b ? api.patch(`admin/cms/banners/${b.id}`, body) : api.post('admin/cms/banners', body);
    },
    {
      invalidate: ['admin/cms/banners'],
      success: b ? 'Banner updated' : 'Banner added',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{b ? 'Edit banner' : 'New banner'}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), save.mutate())}
        >
          <Field label="Title" className="sm:col-span-2">
            <Input value={f.title} onChange={set('title')} required />
          </Field>
          <Field label="Subtitle" className="sm:col-span-2">
            <Input value={f.subtitle} onChange={set('subtitle')} />
          </Field>
          <Field label="Image URL" className="sm:col-span-2">
            <Input type="url" value={f.imageUrl} onChange={set('imageUrl')} required />
          </Field>
          <Field label="Link">
            <Input value={f.linkUrl} onChange={set('linkUrl')} placeholder="foodgrid://offers" />
          </Field>
          <Field label="Placement">
            <Select value={f.placement} onChange={set('placement')}>
              {[...new Set([...PLACEMENTS, f.placement])].map((p) => (
                <option key={p} value={p}>
                  {humanize(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Audience">
            <Select value={f.audience} onChange={set('audience')}>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cities" hint="Empty = everywhere">
            <Input value={f.cities} onChange={set('cities')} placeholder="Bengaluru, Mumbai" />
          </Field>
          <Field label="Order">
            <Input inputMode="numeric" value={f.sortOrder} onChange={set('sortOrder')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Save banner
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Pages() {
  const list = useApi<CmsPage[]>('admin/cms/pages');
  const [editing, setEditing] = React.useState<CmsPage | 'new' | null>(null);
  const columns: Column<CmsPage>[] = [
    {
      key: 'title',
      header: 'Page',
      cell: (p) => (
        <div>
          <p className="font-medium">{p.title}</p>
          <p className="font-mono text-xs text-muted-foreground">/{p.slug}</p>
        </div>
      ),
    },
    { key: 'aud', header: 'Audience', cell: (p) => humanize(p.audience) },
    { key: 'upd', header: 'Updated', cell: (p) => formatDateTime(p.updatedAt) },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => (
        <StatusBadge
          status={p.status === 'PUBLISHED' ? 'PUBLISHED' : p.status}
          label={humanize(p.status)}
        />
      ),
    },
    {
      key: 'edit',
      header: <span className="sr-only">Edit</span>,
      align: 'right',
      cell: (p) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(p)}
          aria-label={`Edit ${p.title}`}
        >
          <Pencil />
        </Button>
      ),
    },
  ];
  return (
    <>
      <FilterBar>
        <Button size="sm" className="ml-auto" onClick={() => setEditing('new')}>
          <Plus /> New page
        </Button>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data}
        getRowId={(p) => p.id}
        loading={list.isLoading}
      />
      {editing ? (
        <PageDialog page={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

function PageDialog({ page: p, onClose }: { page: CmsPage | null; onClose: () => void }) {
  const [f, setF] = React.useState({
    slug: p?.slug ?? '',
    title: p?.title ?? '',
    body: p?.body ?? '',
    status: p?.status ?? 'DRAFT',
    audience: p?.audience ?? 'ALL',
    seoTitle: p?.seoTitle ?? '',
    seoDescription: p?.seoDescription ?? '',
  });
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });
  const save = useApiMutation(
    () => {
      const body = {
        ...f,
        seoTitle: f.seoTitle || undefined,
        seoDescription: f.seoDescription || undefined,
      };
      return p ? api.patch(`admin/cms/pages/${p.id}`, body) : api.post('admin/cms/pages', body);
    },
    {
      invalidate: ['admin/cms/pages'],
      success: f.status === 'PUBLISHED' ? 'Page published' : 'Page saved',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{p ? `Edit ${p.title}` : 'New page'}</DialogTitle>
          <DialogDescription>Body is Markdown.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => (e.preventDefault(), save.mutate())}
        >
          <Field label="Title">
            <Input value={f.title} onChange={set('title')} required />
          </Field>
          <Field label="Slug" hint="Lower case, hyphens">
            <Input value={f.slug} onChange={set('slug')} pattern="[a-z0-9-]+" required />
          </Field>
          <Field label="Body" className="sm:col-span-2">
            <Textarea
              rows={12}
              className="font-mono text-xs"
              value={f.body}
              onChange={set('body')}
              required
            />
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={set('status')}>
              {['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Audience">
            <Select value={f.audience} onChange={set('audience')}>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="SEO title">
            <Input value={f.seoTitle} onChange={set('seoTitle')} />
          </Field>
          <Field label="SEO description">
            <Input value={f.seoDescription} onChange={set('seoDescription')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Save page
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
