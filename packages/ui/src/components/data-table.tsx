'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './button';
import { EmptyState } from './layout';
import { Skeleton } from './misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Value used for client-side sorting. */
  sortValue?: (row: T) => number | string | null;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export interface Pagination {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
}

/**
 * Data table: sortable columns, empty and loading states, optional server
 * pagination. While refetching it keeps the previous rows at reduced opacity
 * (no skeleton flash, no layout jump).
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  fetching,
  empty,
  onRowClick,
  pagination,
  caption,
  className,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  loading?: boolean;
  fetching?: boolean;
  empty?: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode };
  onRowClick?: (row: T) => void;
  pagination?: Pagination;
  caption?: string;
  className?: string;
}) {
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = React.useMemo(() => {
    if (!rows || !sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va === vb) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va > vb ? 1 : -1) * sort.dir;
    });
  }, [rows, sort, columns]);

  if (!loading && rows && rows.length === 0 && empty) return <EmptyState {...empty} />;

  return (
    <div className={cn('rounded-xl border bg-card', className)}>
      <div className={cn('transition-opacity', fetching && !loading && 'opacity-60')} aria-busy={loading || fetching || undefined}>
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <TableHead key={c.key} className={cn(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)} aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}>
                    {c.sortValue ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}
                      >
                        {c.header}
                        {active ? sort!.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                      </button>
                    ) : (
                      c.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !rows
              ? Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.key}>
                        <Skeleton className="h-4 w-full max-w-32" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : (sorted ?? []).map((row) => (
                  <TableRow
                    key={getRowId(row)}
                    className={cn(onRowClick && 'cursor-pointer')}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => (e.key === 'Enter' ? onRowClick(row) : undefined) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {columns.map((c) => (
                      <TableCell key={c.key} className={cn(c.align === 'right' && 'text-right tabular', c.align === 'center' && 'text-center', c.className)}>
                        {c.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-sm text-muted-foreground">
          <span>
            Page {pagination.page} of {pagination.totalPages}
            {pagination.total !== undefined ? ` · ${pagination.total} total` : ''}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" aria-label="Previous page" disabled={pagination.page <= 1} onClick={() => pagination.onPageChange(pagination.page - 1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon" aria-label="Next page" disabled={pagination.page >= pagination.totalPages} onClick={() => pagination.onPageChange(pagination.page + 1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
