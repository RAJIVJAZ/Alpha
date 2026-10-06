import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type * as React from 'react';
import { cn } from '../lib/utils';
import { Card } from './card';

export interface StatDelta {
  /** Signed percentage change vs the comparison period. */
  pct: number | null;
  /** Comparison period, e.g. "vs previous 30 days". */
  label: string;
  /** Whether an increase is good (revenue) or bad (cancellations). Default true. */
  upIsGood?: boolean;
}

/**
 * KPI tile: label · value · delta (direction × good/bad, icon + sign, never
 * color alone) · optional sparkline (de-emphasis line, current point accent).
 */
export function StatTile({
  label,
  value,
  delta,
  trend,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: StatDelta;
  trend?: number[];
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col gap-2 p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {trend && trend.length > 1 ? <Sparkline values={trend} /> : null}
      </div>
      {delta ? <DeltaLine {...delta} /> : null}
    </Card>
  );
}

function DeltaLine({ pct, label, upIsGood = true }: StatDelta) {
  if (pct === null || !Number.isFinite(pct)) return <p className="text-xs text-muted-foreground">No data {label}</p>;
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const good = flat ? null : up === upIsGood;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className={cn('inline-flex items-center gap-0.5 font-medium', good === true && 'text-delta-up', good === false && 'text-delta-down')}>
        <Icon className="size-3.5" aria-hidden />
        {up ? '+' : ''}
        {pct.toFixed(1)}%
      </span>
      <span>{label}</span>
    </p>
  );
}

/** 12-ish point trend line: de-emphasis stroke, accent end-dot with surface ring. */
export function Sparkline({ values, width = 96, height = 32 }: { values: number[]; width?: number; height?: number }) {
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i * (width - 2 * pad)) / (values.length - 1), height - pad - ((v - min) / span) * (height - 2 * pad)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke="var(--chart-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={4} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}

/** Percentage change helper for deltas. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}
