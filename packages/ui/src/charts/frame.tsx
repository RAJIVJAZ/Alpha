'use client';

import * as React from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Card } from '../components/card';

/** Card container with title, legend, chart/table toggle. Height includes the axis band. */
export function ChartFrame({
  title,
  description,
  legend,
  table,
  actions,
  loading,
  className,
  children,
}: {
  title: string;
  description?: string;
  legend?: React.ReactNode;
  table?: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = React.useState(false);
  return (
    <Card className={cn('flex flex-col gap-3 p-5', className)}>
      <figure className="contents">
        <div className="flex items-start justify-between gap-3">
          <figcaption className="min-w-0">
            <p className="font-semibold leading-tight">{title}</p>
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </figcaption>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            {table ? (
              <button
                type="button"
                onClick={() => setAsTable((v) => !v)}
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-pressed={asTable}
                aria-label={asTable ? 'Show chart' : 'Show data table'}
                title={asTable ? 'Show chart' : 'Show data table'}
              >
                {asTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
              </button>
            ) : null}
          </div>
        </div>
        {!asTable && legend}
        <div className={cn('transition-opacity', loading && 'opacity-50')}>{asTable ? table : children}</div>
      </figure>
    </Card>
  );
}

