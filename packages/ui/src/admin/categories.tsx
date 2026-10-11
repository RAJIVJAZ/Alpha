'use client';

import * as React from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '../components/button';
import { DataTable, type Column } from '../components/data-table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Field, Input } from '../components/form';
import { FilterBar } from '../components/layout';
import { Switch } from '../components/menu';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';

interface Category {
  id: string;
  code: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number };
}

const PATH = 'admin/marketplace/categories';

/** "Bakery supplies" → "BAKERY_SUPPLIES": the code products and filters use. */
const codeFromName = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

/** Marketplace categories: sellers must list every product in an active one. */
export function MarketplaceCategories() {
  const list = useApi<Category[]>(PATH);
  const [editing, setEditing] = React.useState<Category | 'new' | null>(null);
  const toggle = useApiMutation(
    (c: Category) => api.patch<Category>(`${PATH}/${c.id}`, { isActive: !c.isActive }),
    {
      invalidate: [PATH, 'marketplace/categories'],
      success: (c) =>
        c.isActive
          ? `${c.name} is back in the marketplace`
          : `${c.name} deactivated; its products stay listed`,
    },
  );
  const columns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Category',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div>
          <p className="font-medium">{c.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
        </div>
      ),
    },
    {
      key: 'products',
      header: 'Products',
      align: 'right',
      sortValue: (c) => c._count.products,
      cell: (c) => formatNumber(c._count.products),
    },
    { key: 'order', header: 'Order', align: 'right', cell: (c) => c.sortOrder },
    {
      key: 'active',
      header: 'Active',
      cell: (c) => (
        <Switch
          checked={c.isActive}
          onCheckedChange={() => toggle.mutate(c)}
          aria-label={`${c.isActive ? 'Deactivate' : 'Activate'} ${c.name}`}
        />
      ),
    },
    {
      key: 'edit',
      header: <span className="sr-only">Edit</span>,
      align: 'right',
      cell: (c) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(c)}
          aria-label={`Rename ${c.name}`}
        >
          <Pencil />
        </Button>
      ),
    },
  ];
  return (
    <>
      <FilterBar>
        <p className="text-sm text-muted-foreground">
          Deactivated categories are hidden from buyers and take no new products.
        </p>
        <Button size="sm" className="ml-auto" onClick={() => setEditing('new')}>
          <Plus /> New category
        </Button>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.data}
        getRowId={(c) => c.id}
        loading={list.isLoading}
        empty={{ title: 'No categories yet' }}
      />
      {editing ? (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          nextOrder={(list.data ?? []).reduce((m, c) => Math.max(m, c.sortOrder + 1), 0)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function CategoryDialog({
  category: c,
  nextOrder,
  onClose,
}: {
  category: Category | null;
  nextOrder: number;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(c?.name ?? '');
  const [code, setCode] = React.useState(c?.code ?? '');
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [sortOrder, setSortOrder] = React.useState(String(c?.sortOrder ?? nextOrder));
  const save = useApiMutation(
    () => {
      const body = { name: name.trim(), sortOrder: Number(sortOrder) || 0 };
      return c ? api.patch(`${PATH}/${c.id}`, body) : api.post(PATH, { ...body, code });
    },
    {
      invalidate: [PATH, 'marketplace/categories'],
      success: c ? 'Category updated' : 'Category added',
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{c ? `Rename ${c.name}` : 'New category'}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!c && !codeTouched) setCode(codeFromName(e.target.value));
              }}
              minLength={2}
              maxLength={60}
              required
            />
          </Field>
          <Field
            label="Code"
            hint={c ? 'Codes cannot change' : 'Capitals, digits and _; sellers and filters use it'}
          >
            <Input
              className="font-mono"
              value={code}
              onChange={(e) => (setCode(e.target.value.toUpperCase()), setCodeTouched(true))}
              pattern="[A-Z][A-Z0-9_]{1,29}"
              disabled={!!c}
              required
            />
          </Field>
          <Field label="Order" hint="Lower numbers come first">
            <Input
              type="number"
              min={0}
              max={999}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={save.isPending}>
              Save category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
