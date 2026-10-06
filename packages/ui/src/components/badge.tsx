import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'text-foreground',
      neutral: 'border-transparent bg-muted text-muted-foreground',
      good: 'border-status-good/30 bg-status-good/10 text-status-good-text',
      warning: 'border-status-warning/40 bg-status-warning/15 text-foreground',
      serious: 'border-status-serious/40 bg-status-serious/15 text-foreground',
      critical: 'border-status-critical/30 bg-status-critical/10 text-status-critical',
      info: 'border-[var(--chart-1)]/30 bg-[var(--chart-1)]/10 text-foreground',
    },
  },
  defaultVariants: { variant: 'secondary' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => <span className={cn(badgeVariants({ variant }), className)} {...props} />;
