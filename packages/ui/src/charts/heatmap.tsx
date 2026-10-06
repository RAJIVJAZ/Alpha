'use client';

import * as React from 'react';
import { ChartFrame } from './frame';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Sequential blue ramp (reference palette), light -> dark. */
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

/**
 * Day-of-week x hour heatmap (one hue, more is darker) with a scale legend,
 * per-cell hover/focus readout and a table view.
 */
export function WeekHourHeatmap({
  title,
  description,
  cells,
  unit = 'orders',
}: {
  title: string;
  description?: string;
  cells: { dow: number; hour: number; orders: number }[] | undefined;
  unit?: string;
}) {
  const [hover, setHover] = React.useState<{ dow: number; hour: number; v: number } | null>(null);
  const grid = new Map((cells ?? []).map((c) => [`${c.dow}-${c.hour}`, c.orders]));
  const hours = [...new Set((cells ?? []).map((c) => c.hour))].sort((a, b) => a - b);
  const hourRange = hours.length
    ? Array.from({ length: hours[hours.length - 1]! - hours[0]! + 1 }, (_, i) => hours[0]! + i)
    : [];
  const max = Math.max(1, ...(cells ?? []).map((c) => c.orders));
  const step = (v: number) =>
    v <= 0 ? null : RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * RAMP.length))]!;
  const label = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
  const table = (
    <div className="max-h-80 overflow-auto text-sm">
      <table className="w-full">
        <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
          <tr>
            <th className="px-2 py-1 text-left font-medium">Hour</th>
            {DAYS.map((d) => (
              <th key={d} className="px-2 py-1 text-right font-medium">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hourRange.map((h) => (
            <tr key={h} className="border-b last:border-0">
              <td className="px-2 py-1">{label(h)}</td>
              {DAYS.map((_, d) => (
                <td key={d} className="px-2 py-1 text-right tabular">
                  {grid.get(`${d}-${h}`) ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <ChartFrame title={title} description={description} table={table}>
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-[2px]"
          style={{
            gridTemplateColumns: `2.5rem repeat(${hourRange.length}, minmax(1.25rem, 1fr))`,
          }}
          onMouseLeave={() => setHover(null)}
        >
          <span />
          {hourRange.map((h) => (
            <span key={h} className="text-center text-[10px] text-[var(--chart-axis)]">
              {h % 3 === 0 ? label(h) : ''}
            </span>
          ))}
          {DAYS.map((d, di) => (
            <React.Fragment key={d}>
              <span className="pr-1 text-right text-xs leading-5 text-[var(--chart-axis)]">
                {d}
              </span>
              {hourRange.map((h) => {
                const v = grid.get(`${di}-${h}`) ?? 0;
                const fill = step(v);
                return (
                  <button
                    key={h}
                    type="button"
                    aria-label={`${d} ${label(h)}: ${v} ${unit}`}
                    onMouseEnter={() => setHover({ dow: di, hour: h, v })}
                    onFocus={() => setHover({ dow: di, hour: h, v })}
                    className="h-5 rounded-[3px] outline-offset-1 hover:outline hover:outline-2 hover:outline-[var(--chart-text)]"
                    style={{ background: fill ?? 'var(--chart-grid)' }}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span aria-live="polite" className="min-h-4">
          {hover ? (
            <>
              <strong className="text-foreground tabular">{hover.v}</strong> {unit} ·{' '}
              {DAYS[hover.dow]} {label(hover.hour)}
            </>
          ) : (
            'Hover a cell for details'
          )}
        </span>
        <span className="flex items-center gap-1.5">
          0
          <span className="flex" aria-hidden>
            {RAMP.map((c) => (
              <span key={c} className="h-2 w-4" style={{ background: c }} />
            ))}
          </span>
          {max}
        </span>
      </div>
    </ChartFrame>
  );
}
