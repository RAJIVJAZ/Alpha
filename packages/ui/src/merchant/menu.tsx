'use client';

import * as React from 'react';
import { Plus, Search } from 'lucide-react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { EmptyState, FilterBar, PageHeader } from '../components/layout';
import { Switch } from '../components/menu';
import { api } from '../lib/api';
import { useApi, useApiMutation } from '../lib/hooks';
import { OutletPicker, useOutlet } from './outlet';
import type { MenuCategory, MenuItem } from './types';

/** Menu management: availability toggles, prices, new categories and dishes. */
export function MenuManager() {
  const { outletId } = useOutlet();
  const [q, setQ] = React.useState('');
  const [adding, setAdding] = React.useState<string | null>(null);
  const [newCategory, setNewCategory] = React.useState(false);
  const menu = useApi<MenuCategory[]>(outletId ? `merchant/outlets/${outletId}/menu` : null);
  const key = outletId ? `merchant/outlets/${outletId}/menu` : '';
  const availability = useApiMutation((v: { ids: string[]; on: boolean }) => api.post('merchant/items/availability', { itemIds: v.ids, isAvailable: v.on }), { invalidate: [key] });
  const match = (i: MenuItem) => !q || i.name.toLowerCase().includes(q.toLowerCase());
  const total = (menu.data ?? []).reduce((s, c) => s + c.items.length, 0);
  const off = (menu.data ?? []).reduce((s, c) => s + c.items.filter((i) => !i.isAvailable).length, 0);

  return (
    <>
      <PageHeader
        title="Menu"
        description={menu.data ? `${total} dishes · ${off} switched off` : undefined}
        actions={
          <>
            <OutletPicker />
            <Button variant="outline" onClick={() => setNewCategory(true)}>
              <Plus /> Category
            </Button>
          </>
        }
      />
      <FilterBar>
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">Search dishes</span>
          <Input className="w-64 pl-8" placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </FilterBar>
      {menu.data?.length === 0 ? <EmptyState title="No menu yet" description="Add a category, then dishes." /> : null}
      <div className="grid gap-4">
        {(menu.data ?? []).map((cat) => {
          const items = cat.items.filter(match);
          if (q && !items.length) return null;
          return (
            <Card key={cat.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>
                  {cat.name} <span className="text-sm font-normal text-muted-foreground">({cat.items.length})</span>
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => availability.mutate({ ids: cat.items.map((i) => i.id), on: false })}>
                    All off
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => availability.mutate({ ids: cat.items.map((i) => i.id), on: true })}>
                    All on
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAdding(cat.id)}>
                    <Plus /> Dish
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {items.map((item) => (
                  <MenuRow key={item.id} item={item} onToggle={(on) => availability.mutate({ ids: [item.id], on })} invalidateKey={key} />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {outletId ? <NewDishDialog outletId={outletId} categoryId={adding} onClose={() => setAdding(null)} invalidateKey={key} /> : null}
      {outletId ? <NewCategoryDialog outletId={outletId} open={newCategory} onClose={() => setNewCategory(false)} invalidateKey={key} /> : null}
    </>
  );
}

function MenuRow({ item, onToggle, invalidateKey }: { item: MenuItem; onToggle: (on: boolean) => void; invalidateKey: string }) {
  const [price, setPrice] = React.useState(String(Number(item.price)));
  const save = useApiMutation((p: number) => api.patch(`merchant/items/${item.id}`, { price: p }), { invalidate: [invalidateKey], success: `${item.name} price updated` });
  const dirty = Number(price) !== Number(item.price) && Number(price) > 0;
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      <span aria-label={item.isVeg ? 'Vegetarian' : 'Non-vegetarian'} className={`size-3.5 shrink-0 rounded-sm border-2 ${item.isVeg ? 'border-status-good-text' : 'border-status-critical'}`} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {item.name} {item.isRecommended ? <Badge variant="info">Bestseller</Badge> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{item.description ?? `${item.kdsStation.toLowerCase()} station`}</p>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save.mutate(Number(price));
        }}
      >
        <label className="sr-only" htmlFor={`price-${item.id}`}>
          Price of {item.name}
        </label>
        <span className="text-sm text-muted-foreground">₹</span>
        <Input id={`price-${item.id}`} inputMode="decimal" className="h-8 w-24 text-right tabular" value={price} onChange={(e) => setPrice(e.target.value)} />
        {dirty ? (
          <Button size="sm" type="submit" loading={save.isPending}>
            Save
          </Button>
        ) : null}
      </form>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={item.isAvailable} onCheckedChange={onToggle} aria-label={`${item.name} available`} />
        <span className="w-16 text-muted-foreground">{item.isAvailable ? 'In stock' : 'Off'}</span>
      </label>
    </div>
  );
}

function NewDishDialog({ outletId, categoryId, onClose, invalidateKey }: { outletId: string; categoryId: string | null; onClose: () => void; invalidateKey: string }) {
  const [form, setForm] = React.useState({ name: '', price: '', isVeg: 'true', description: '', station: 'MAIN' });
  const create = useApiMutation(
    () => api.post(`merchant/outlets/${outletId}/items`, { categoryId, name: form.name, price: Number(form.price), isVeg: form.isVeg === 'true', description: form.description || undefined, kdsStation: form.station }),
    { invalidate: [invalidateKey], success: 'Dish added', onSuccess: () => (setForm({ name: '', price: '', isVeg: 'true', description: '', station: 'MAIN' }), onClose()) },
  );
  return (
    <Dialog open={!!categoryId} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a dish</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Price (₹, before GST)">
              <Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </Field>
            <Field label="Type">
              <Select value={form.isVeg} onChange={(e) => setForm({ ...form, isVeg: e.target.value })}>
                <option value="true">Vegetarian</option>
                <option value="false">Non-vegetarian</option>
              </Select>
            </Field>
          </div>
          <Field label="Kitchen station">
            <Input value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={create.isPending}>
              Add dish
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewCategoryDialog({ outletId, open, onClose, invalidateKey }: { outletId: string; open: boolean; onClose: () => void; invalidateKey: string }) {
  const [name, setName] = React.useState('');
  const create = useApiMutation(() => api.post(`merchant/outlets/${outletId}/categories`, { name }), { invalidate: [invalidateKey], success: 'Category added', onSuccess: () => (setName(''), onClose()) });
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

