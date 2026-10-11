'use client';

import * as React from 'react';
import { ImagePlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { EmptyState, FilterBar, PageHeader } from '../components/layout';
import { Switch } from '../components/menu';
import { Thumb } from '../components/thumb';
import { api, uploadMedia } from '../lib/api';
import { useApi, useApiMutation } from '../lib/hooks';
import { useCan } from './access';
import { dishBody, type AddonGroupForm, type DishForm } from './forms';
import { OutletPicker, useOutlet } from './outlet';
import type { MenuCategory, MenuItem } from './types';

/** Menu management: availability toggles, prices, categories and dishes with sizes and add-ons. */
export function MenuManager() {
  const { outletId } = useOutlet();
  const canManage = useCan('menu:manage');
  const [q, setQ] = React.useState('');
  const [dish, setDish] = React.useState<{ categoryId: string; item?: MenuItem } | null>(null);
  const [category, setCategory] = React.useState<MenuCategory | 'new' | null>(null);
  const [deleting, setDeleting] = React.useState<MenuCategory | null>(null);
  const menu = useApi<MenuCategory[]>(outletId ? `merchant/outlets/${outletId}/menu` : null);
  const key = outletId ? `merchant/outlets/${outletId}/menu` : '';
  const availability = useApiMutation(
    (v: { ids: string[]; on: boolean }) =>
      api.post('merchant/items/availability', { itemIds: v.ids, isAvailable: v.on }),
    { invalidate: [key] },
  );
  const removeCategory = useApiMutation(
    (c: MenuCategory) => api.delete(`merchant/categories/${c.id}`),
    {
      invalidate: [key],
      success: 'Category deleted',
      onSuccess: () => setDeleting(null),
    },
  );
  const match = (i: MenuItem) => !q || i.name.toLowerCase().includes(q.toLowerCase());
  const total = (menu.data ?? []).reduce((s, c) => s + c.items.length, 0);
  const off = (menu.data ?? []).reduce(
    (s, c) => s + c.items.filter((i) => !i.isAvailable).length,
    0,
  );

  return (
    <>
      <PageHeader
        title="Menu"
        description={menu.data ? `${total} dishes · ${off} switched off` : undefined}
        actions={
          <>
            <OutletPicker />
            {canManage ? (
              <Button variant="outline" onClick={() => setCategory('new')}>
                <Plus /> Category
              </Button>
            ) : null}
          </>
        }
      />
      <FilterBar>
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search dishes</span>
          <Input
            className="w-64 pl-8"
            placeholder="Search dishes"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </FilterBar>
      {menu.data?.length === 0 ? (
        <EmptyState title="No menu yet" description="Add a category, then dishes." />
      ) : null}
      <div className="grid gap-4">
        {(menu.data ?? []).map((cat) => {
          const items = cat.items.filter(match);
          if (q && !items.length) return null;
          return (
            <Card key={cat.id}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  {cat.name}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({cat.items.length})
                  </span>
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  {canManage ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCategory(cat)}
                        aria-label={`Rename ${cat.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleting(cat)}
                        disabled={cat.items.length > 0}
                        title={cat.items.length ? 'Move or delete its dishes first' : undefined}
                        aria-label={
                          cat.items.length
                            ? `Delete ${cat.name} (move or delete its dishes first)`
                            : `Delete ${cat.name}`
                        }
                      >
                        <Trash2 />
                      </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      availability.mutate({ ids: cat.items.map((i) => i.id), on: false })
                    }
                  >
                    All off
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      availability.mutate({ ids: cat.items.map((i) => i.id), on: true })
                    }
                  >
                    All on
                  </Button>
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDish({ categoryId: cat.id })}
                    >
                      <Plus /> Dish
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {items.map((item) => (
                  <MenuRow
                    // remount when the price changes elsewhere so the inline price box isn't stale
                    key={`${item.id}:${item.price}`}
                    item={item}
                    canManage={canManage}
                    onToggle={(on) => availability.mutate({ ids: [item.id], on })}
                    onEdit={() => setDish({ categoryId: cat.id, item })}
                    invalidateKey={key}
                  />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {outletId && dish ? (
        <DishDialog
          outletId={outletId}
          categories={menu.data ?? []}
          categoryId={dish.categoryId}
          item={dish.item}
          onClose={() => setDish(null)}
          invalidateKey={key}
        />
      ) : null}
      {outletId && category ? (
        <CategoryDialog
          outletId={outletId}
          category={category === 'new' ? null : category}
          onClose={() => setCategory(null)}
          invalidateKey={key}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => (!o ? setDeleting(null) : undefined)}
        title={`Delete ${deleting?.name ?? 'category'}?`}
        confirmLabel="Delete"
        destructive
        loading={removeCategory.isPending}
        onConfirm={() => deleting && removeCategory.mutate(deleting)}
      />
    </>
  );
}

function MenuRow({
  item,
  canManage,
  onToggle,
  onEdit,
  invalidateKey,
}: {
  item: MenuItem;
  canManage: boolean;
  onToggle: (on: boolean) => void;
  onEdit: () => void;
  invalidateKey: string;
}) {
  const [price, setPrice] = React.useState(String(Number(item.price)));
  const save = useApiMutation((p: number) => api.patch(`merchant/items/${item.id}`, { price: p }), {
    invalidate: [invalidateKey],
    success: `${item.name} price updated`,
  });
  const dirty = Number(price) !== Number(item.price) && Number(price) > 0;
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      <span
        aria-label={item.isVeg ? 'Vegetarian' : 'Non-vegetarian'}
        className={`size-3.5 shrink-0 rounded-sm border-2 ${item.isVeg ? 'border-status-good-text' : 'border-status-critical'}`}
      />
      <Thumb src={item.imageUrl} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {item.name} {item.isRecommended ? <Badge variant="info">Bestseller</Badge> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {item.description ?? `${item.kdsStation.toLowerCase()} station`}
          {item.variants.length ? ` · ${item.variants.length} sizes` : ''}
          {item.addonGroups.length ? ` · ${item.addonGroups.length} add-on groups` : ''}
        </p>
      </div>
      {canManage ? (
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
          <Input
            id={`price-${item.id}`}
            inputMode="decimal"
            className="h-8 w-24 text-right tabular"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          {dirty ? (
            <Button size="sm" type="submit" loading={save.isPending}>
              Save
            </Button>
          ) : null}
        </form>
      ) : (
        <span className="text-sm tabular">₹{Number(item.price)}</span>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={item.isAvailable}
          onCheckedChange={onToggle}
          aria-label={`${item.name} available`}
        />
        <span className="w-16 text-muted-foreground">{item.isAvailable ? 'In stock' : 'Off'}</span>
      </label>
      {canManage ? (
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${item.name}`}>
          <Pencil />
        </Button>
      ) : null}
    </div>
  );
}

const toForm = (categoryId: string, station: string, item?: MenuItem): DishForm => ({
  categoryId: item?.categoryId ?? categoryId,
  name: item?.name ?? '',
  description: item?.description ?? '',
  price: item ? String(Number(item.price)) : '',
  isVeg: item?.isVeg ?? true,
  kdsStation: item?.kdsStation ?? station,
  variants: (item?.variants ?? []).map((v) => ({
    name: v.name,
    priceDelta: String(Number(v.priceDelta)),
    isAvailable: v.isAvailable,
  })),
  defaultVariant: Math.max(0, item?.variants.findIndex((v) => v.isDefault) ?? 0),
  addonGroups: (item?.addonGroups ?? []).map((g) => ({
    name: g.name,
    minSelect: String(g.minSelect),
    maxSelect: String(g.maxSelect),
    addons: g.addons.map((a) => ({
      name: a.name,
      price: String(Number(a.price)),
      isVeg: a.isVeg,
      isAvailable: a.isAvailable,
    })),
  })),
});

/** Add a dish to `categoryId`, or edit `item`: details, photo, sizes and add-on groups. */
function DishDialog({
  outletId,
  categories,
  categoryId,
  item,
  onClose,
  invalidateKey,
}: {
  outletId: string;
  categories: MenuCategory[];
  categoryId: string;
  item?: MenuItem;
  onClose: () => void;
  invalidateKey: string;
}) {
  const { outlet } = useOutlet();
  const stations = outlet?.kdsStations?.length ? outlet.kdsStations : ['MAIN'];
  const [initial] = React.useState(() => toForm(categoryId, stations[0]!, item));
  const [form, setForm] = React.useState(initial);
  const [file, setFile] = React.useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const set = (patch: Partial<DishForm>) => setForm((f) => ({ ...f, ...patch }));
  const setGroup = (n: number, patch: Partial<AddonGroupForm>) =>
    set({ addonGroups: form.addonGroups.map((g, i) => (i === n ? { ...g, ...patch } : g)) });

  const save = useApiMutation(
    async () => {
      const { variants, addonGroups, ...details } = dishBody(form); // validate before uploading
      const imageUrl = file ? await uploadMedia(file, 'menu') : removePhoto ? null : undefined;
      // saving options re-creates them with new ids, which voids carts holding the old ones
      const optionsChanged =
        !item ||
        JSON.stringify([form.variants, form.defaultVariant, form.addonGroups]) !==
          JSON.stringify([initial.variants, initial.defaultVariant, initial.addonGroups]);
      const body = {
        ...details,
        ...(imageUrl === undefined ? {} : { imageUrl }),
        ...(optionsChanged ? { variants, addonGroups } : {}),
      };
      return item
        ? api.patch(`merchant/items/${item.id}`, body)
        : api.post(`merchant/outlets/${outletId}/items`, body);
    },
    {
      invalidate: [invalidateKey],
      success: item ? `${form.name} updated` : 'Dish added',
      onSuccess: onClose,
    },
  );
  const remove = useApiMutation(() => api.delete(`merchant/items/${item!.id}`), {
    invalidate: [invalidateKey],
    success: `${item?.name} deleted`,
    onSuccess: onClose,
  });

  const photo = removePhoto ? null : item?.imageUrl;
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : 'Add a dish'}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Field label="Name">
            <Input
              value={form.name}
              maxLength={120}
              onChange={(e) => set({ name: e.target.value })}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price (₹, before GST)">
              <Input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => set({ price: e.target.value })}
                required
              />
            </Field>
            <Field label="Type">
              <Select
                value={String(form.isVeg)}
                onChange={(e) => set({ isVeg: e.target.value === 'true' })}
              >
                <option value="true">Vegetarian</option>
                <option value="false">Non-vegetarian</option>
              </Select>
            </Field>
            <Field label="Kitchen station">
              <Select value={form.kdsStation} onChange={(e) => set({ kdsStation: e.target.value })}>
                {[...new Set([...stations, form.kdsStation])].map((s) => (
                  <option key={s} value={s}>
                    {s.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            {item ? (
              <Field label="Category">
                <Select
                  value={form.categoryId}
                  onChange={(e) => set({ categoryId: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <Field label="Description">
            <Textarea
              maxLength={600}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Thumb src={photo} className="size-16" />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring/30 hover:bg-muted">
              <ImagePlus className="size-5" aria-hidden />
              {file ? file.name : photo ? 'Replace photo' : 'Add a photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => (setFile(e.target.files?.[0] ?? null), setRemovePhoto(false))}
              />
            </label>
            {photo && !file ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setRemovePhoto(true)}>
                Remove photo
              </Button>
            ) : null}
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">
              Sizes{' '}
              <span className="font-normal text-muted-foreground">
                (optional; the amount is added to the price, the selected one is preselected)
              </span>
            </legend>
            {form.variants.map((v, n) => (
              <div key={n} className="grid grid-cols-[auto_1fr_7rem_auto] items-center gap-2">
                <input
                  type="radio"
                  name="default-size"
                  aria-label={`Preselect ${v.name || `size ${n + 1}`}`}
                  checked={form.defaultVariant === n}
                  onChange={() => set({ defaultVariant: n })}
                  className="accent-[var(--primary)]"
                />
                <Input
                  aria-label={`Size ${n + 1} name`}
                  placeholder="e.g. Half"
                  maxLength={60}
                  required
                  value={v.name}
                  onChange={(e) =>
                    set({
                      variants: form.variants.map((x, i) =>
                        i === n ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Input
                  aria-label={`Size ${n + 1} price change (₹)`}
                  placeholder="± ₹"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={v.priceDelta}
                  onChange={(e) =>
                    set({
                      variants: form.variants.map((x, i) =>
                        i === n ? { ...x, priceDelta: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove size ${v.name || n + 1}`}
                  onClick={() =>
                    set({
                      variants: form.variants.filter((_, i) => i !== n),
                      defaultVariant:
                        form.defaultVariant > n ? form.defaultVariant - 1 : form.defaultVariant,
                    })
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="justify-self-start"
              onClick={() =>
                set({
                  variants: [...form.variants, { name: '', priceDelta: '', isAvailable: true }],
                })
              }
            >
              <Plus /> Size
            </Button>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">Add-on groups</legend>
            {form.addonGroups.map((g, n) => (
              <div key={n} className="grid gap-2 rounded-lg border p-3">
                <div className="grid grid-cols-[1fr_5rem_5rem_auto] items-end gap-2">
                  <Field label="Group">
                    <Input
                      placeholder="e.g. Extras"
                      maxLength={60}
                      required
                      value={g.name}
                      onChange={(e) => setGroup(n, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Min picks">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={g.minSelect}
                      onChange={(e) => setGroup(n, { minSelect: e.target.value })}
                    />
                  </Field>
                  <Field label="Max picks">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={g.maxSelect}
                      onChange={(e) => setGroup(n, { maxSelect: e.target.value })}
                    />
                  </Field>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove group ${g.name || n + 1}`}
                    onClick={() => set({ addonGroups: form.addonGroups.filter((_, i) => i !== n) })}
                  >
                    <X />
                  </Button>
                </div>
                {g.addons.map((a, m) => {
                  const setAddon = (patch: Partial<typeof a>) =>
                    setGroup(n, {
                      addons: g.addons.map((x, i) => (i === m ? { ...x, ...patch } : x)),
                    });
                  const label = a.name || `option ${m + 1}`;
                  return (
                    <div key={m} className="grid grid-cols-[1fr_6rem_auto_auto] items-center gap-2">
                      <Input
                        aria-label={`${g.name || 'Group'} option ${m + 1} name`}
                        placeholder="e.g. Extra cheese"
                        maxLength={60}
                        required
                        value={a.name}
                        onChange={(e) => setAddon({ name: e.target.value })}
                      />
                      <Input
                        aria-label={`Price of ${label} (₹)`}
                        placeholder="₹"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={a.price}
                        onChange={(e) => setAddon({ price: e.target.value })}
                      />
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={a.isVeg}
                          onChange={(e) => setAddon({ isVeg: e.target.checked })}
                          className="accent-[var(--primary)]"
                        />
                        Veg
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${label}`}
                        onClick={() => setGroup(n, { addons: g.addons.filter((_, i) => i !== m) })}
                      >
                        <X />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="justify-self-start"
                  onClick={() =>
                    setGroup(n, {
                      addons: [
                        ...g.addons,
                        { name: '', price: '', isVeg: form.isVeg, isAvailable: true },
                      ],
                    })
                  }
                >
                  <Plus /> Option
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="justify-self-start"
              onClick={() =>
                set({
                  addonGroups: [
                    ...form.addonGroups,
                    { name: '', minSelect: '0', maxSelect: '1', addons: [] },
                  ],
                })
              }
            >
              <Plus /> Add-on group
            </Button>
          </fieldset>

          <DialogFooter>
            {item ? (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 /> Delete dish
              </Button>
            ) : null}
            <Button type="submit" loading={save.isPending}>
              {item ? 'Save' : 'Add dish'}
            </Button>
          </DialogFooter>
        </form>
        {item ? (
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`Delete ${item.name}?`}
            description="It disappears from the menu, POS and QR ordering. To pause it instead, switch it off."
            confirmLabel="Delete dish"
            destructive
            loading={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  outletId,
  category,
  onClose,
  invalidateKey,
}: {
  outletId: string;
  category: MenuCategory | null;
  onClose: () => void;
  invalidateKey: string;
}) {
  const [name, setName] = React.useState(category?.name ?? '');
  const save = useApiMutation(
    () =>
      category
        ? api.patch(`merchant/categories/${category.id}`, { name })
        : api.post(`merchant/outlets/${outletId}/categories`, { name }),
    {
      invalidate: [invalidateKey],
      success: category ? 'Category renamed' : 'Category added',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? `Rename ${category.name}` : 'New category'}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Field label="Name">
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={save.isPending}>
              {category ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
