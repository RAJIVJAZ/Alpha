'use client';

import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { Select } from './form';

export type RangePreset = 'today' | '7d' | '30d' | '90d' | 'mtd';

export interface DateRange {
  preset: RangePreset;
  from: string;
  to: string;
  /** Same-length window immediately before, for deltas. */
  prevFrom: string;
  prevTo: string;
}

const ymd = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** IST calendar ranges ending today (inclusive). */
export function rangeFor(preset: RangePreset, now = new Date()): DateRange {
  const today = new Date(`${ymd(now)}T00:00:00Z`);
  let from: Date;
  switch (preset) {
    case 'today':
      from = today;
      break;
    case '7d':
      from = shift(today, -6);
      break;
    case '90d':
      from = shift(today, -89);
      break;
    case 'mtd':
      from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      break;
    default:
      from = shift(today, -29);
  }
  const days = Math.round((today.getTime() - from.getTime()) / 86_400_000) + 1;
  const prevTo = shift(from, -1);
  const prevFrom = shift(prevTo, -(days - 1));
  return { preset, from: iso(from), to: iso(today), prevFrom: iso(prevFrom), prevTo: iso(prevTo) };
}

export const RANGE_LABEL: Record<RangePreset, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  mtd: 'Month to date',
};

export function useDateRange(initial: RangePreset = '30d') {
  const [preset, setPreset] = React.useState<RangePreset>(initial);
  const range = React.useMemo(() => rangeFor(preset), [preset]);
  return { range, preset, setPreset };
}

/** Preset date-range control: the first filter in a dashboard's filter row. */
export function DateRangePicker({
  value,
  onChange,
  options = ['7d', '30d', '90d', 'mtd'],
}: {
  value: RangePreset;
  onChange: (p: RangePreset) => void;
  options?: RangePreset[];
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">Date range</span>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value as RangePreset)}
        className="h-8 w-auto"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {RANGE_LABEL[o]}
          </option>
        ))}
      </Select>
    </label>
  );
}

/**
 * Daily rows for charts: one row per IST day from `from` to the last complete
 * day (today is still accumulating, so it is left out unless the range is
 * just today). Missing days are filled with `empty` so lines don't bridge gaps.
 */
export function chartDays<T extends { date: string }>(
  rows: T[] | undefined,
  range: Pick<DateRange, 'from' | 'to' | 'preset'>,
  empty: Omit<T, 'date'>,
): T[] | undefined {
  if (!rows) return rows;
  const today = ymd(new Date());
  const last =
    range.preset === 'today'
      ? range.to
      : range.to < today
        ? range.to
        : iso(shift(new Date(`${today}T00:00:00Z`), -1));
  const byDate = new Map(rows.map((r) => [r.date.slice(0, 10), r]));
  const out: T[] = [];
  for (let d = new Date(`${range.from}T00:00:00Z`); iso(d) <= last; d = shift(d, 1)) {
    const key = iso(d);
    out.push(byDate.get(key) ?? ({ ...empty, date: key } as T));
  }
  return out;
}
