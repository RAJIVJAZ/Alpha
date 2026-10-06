import type * as React from 'react';
import { cn } from '../lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-1 text-muted-foreground [&_svg]:size-8">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Responsive KPI row. */
export const StatGrid = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)} {...props} />
);

/** Single row of filters above the content they scope. */
export const FilterBar = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    role="toolbar"
    className={cn('mb-4 flex flex-wrap items-center gap-2', className)}
    {...props}
  />
);

export function ErrorNotice({ error, className }: { error: unknown; className?: string }) {
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-status-critical/30 bg-status-critical/10 px-4 py-3 text-sm',
        className,
      )}
    >
      {message}
    </div>
  );
}
