import * as React from 'react';
import { cn } from '../lib/utils';

export const Separator = ({ className, vertical, ...props }: React.HTMLAttributes<HTMLDivElement> & { vertical?: boolean }) => (
  <div role="separator" aria-orientation={vertical ? 'vertical' : 'horizontal'} className={cn('shrink-0 bg-border', vertical ? 'h-full w-px' : 'h-px w-full', className)} {...props} />
);

export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;

export function Avatar({ name, src, className }: { name?: string | null; src?: string | null; className?: string }) {
  const initials = (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span className={cn('inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-semibold text-accent-foreground', className)}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <span aria-hidden>{initials || '?'}</span>}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-block size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary', className)}>
      <span className="sr-only">{label}</span>
    </span>
  );
}
