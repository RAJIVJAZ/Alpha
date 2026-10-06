'use client';

/**
 * Charts (Recharts) following the dataviz method:
 * - series colors come from the validated categorical palette in fixed slot
 *   order and follow the entity (pass `slot` to pin a color);
 * - thin marks: bars <= 24px with a 4px rounded data-end, 2px lines, 10% area
 *   wash, 2px surface gap between grouped bars, hairline solid grid;
 * - hover: crosshair + one tooltip listing every series (line/area), per-bar
 *   tooltip on bars; values lead, labels follow;
 * - a legend for >= 2 series, direct end labels on <= 4 lines, and a table
 *   view toggle on every chart (light-mode relief rule for low-contrast slots).
 */
import * as React from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from '../lib/format';
import { ChartFrame } from './frame';

export { ChartFrame };

export interface Series {
  key: string;
  label: string;
  /** 1-8: fixed palette slot so an entity keeps its color across filters. */
  slot?: number;
  /** Dashed stroke, for projected values (forecasts, targets). */
  dashed?: boolean;
}

type Datum = Record<string, string | number | null | undefined>;
type Fmt = (v: number) => string;

const color = (s: Series, i: number) => `var(--chart-${Math.min(8, s.slot ?? i + 1)})`;
const AXIS = { fill: 'var(--chart-axis)', fontSize: 12 };
const defaultFmt: Fmt = (v) => formatNumber(v, { compact: true });

function TooltipBox({ title, rows }: { title: React.ReactNode; rows: { key: string; label: string; value: string; color: string; shape: 'line' | 'rect' }[] }) {
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 py-0.5">
          <span aria-hidden className={r.shape === 'line' ? 'h-0.5 w-3 rounded' : 'size-2.5 rounded-sm'} style={{ background: r.color }} />
          <span className="font-semibold tabular">{r.value}</span>
          <span className="text-muted-foreground">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ series, shape }: { series: Series[]; shape: 'line' | 'rect' }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className={shape === 'line' ? 'h-0.5 w-3.5 rounded' : 'size-2.5 rounded-sm'} style={{ background: color(s, i) }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function DataTableView({ data, xKey, xLabel, series, valueFormat, xFormat }: { data: Datum[]; xKey: string; xLabel: string; series: Series[]; valueFormat: Fmt; xFormat: (v: string | number) => string }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">{xLabel}</th>
            {series.map((s) => (
              <th key={s.key} className="px-2 py-1.5 text-right font-medium">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="px-2 py-1.5">{xFormat(d[xKey] as string | number)}</td>
              {series.map((s) => (
                <td key={s.key} className="px-2 py-1.5 text-right tabular">
                  {d[s.key] === null || d[s.key] === undefined ? '—' : valueFormat(Number(d[s.key]))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CommonProps {
  title: string;
  description?: string;
  data: Datum[] | undefined;
  series: Series[];
  valueFormat?: Fmt;
  height?: number;
  loading?: boolean;
  actions?: React.ReactNode;
  className?: string;
}

/** Trend over time: lines (multi-series) or a single-series area wash. */
export function TrendChart({
  xKey,
  xLabel = 'Date',
  xFormat = (v) => String(v),
  kind = 'line',
  valueFormat = defaultFmt,
  height = 260,
  integer = false,
  ...p
}: CommonProps & { xKey: string; xLabel?: string; xFormat?: (v: string | number) => string; kind?: 'line' | 'area'; integer?: boolean }) {
  const data = p.data ?? [];
  const endLabels = p.series.length > 1 && p.series.length <= 4;
  // a series that stops early (actuals before a forecast) is labelled at its own last point
  const lastIndex = Object.fromEntries(p.series.map((s) => [s.key, data.reduce((last, d, i) => (d[s.key] === null || d[s.key] === undefined ? last : i), -1)]));
  const Chart = kind === 'area' ? AreaChart : LineChart;
  return (
    <ChartFrame
      title={p.title}
      description={p.description}
      loading={p.loading}
      actions={p.actions}
      className={p.className}
      legend={<Legend series={p.series} shape={kind === 'area' ? 'rect' : 'line'} />}
      table={<DataTableView data={data} xKey={xKey} xLabel={xLabel} series={p.series} valueFormat={valueFormat} xFormat={xFormat} />}
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={data} margin={{ top: 8, right: endLabels ? 72 : 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--chart-baseline)' }} tickFormatter={xFormat} minTickGap={24} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={valueFormat} allowDecimals={!integer} />
            <Tooltip
              cursor={{ stroke: 'var(--chart-baseline)', strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={xFormat(label as string | number)}
                    rows={p.series.map((s, i) => {
                      const v = payload.find((x) => x.dataKey === s.key)?.value;
                      return { key: s.key, label: s.label, value: v === undefined || v === null ? '—' : valueFormat(Number(v)), color: color(s, i), shape: kind === 'area' ? 'rect' : 'line' };
                    })}
                  />
                ) : null
              }
            />
            {p.series.map((s, i) =>
              kind === 'area' ? (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color(s, i)} strokeWidth={2} fill={color(s, i)} fillOpacity={0.1} activeDot={{ r: 4, stroke: 'var(--chart-surface)', strokeWidth: 2 }} isAnimationActive={false} />
              ) : (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={color(s, i)}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  connectNulls={false}
                  dot={false}
                  activeDot={{ r: 4, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                  label={
                    endLabels
                      ? (props: { index?: number; x?: number | string; y?: number | string }) =>
                          props.index === lastIndex[s.key] ? (
                            <text key={`${s.key}-end`} x={Number(props.x) + 8} y={Number(props.y)} dy={4} fontSize={12} fill="var(--chart-text)">
                              {s.label}
                            </text>
                          ) : (
                            <g key={`${s.key}-${props.index}`} />
                          )
                      : undefined
                  }
                />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Magnitude by category: columns (vertical) or bars (horizontal, for long names). */
export function CategoryBarChart({
  categoryKey,
  categoryLabel = 'Category',
  layout = 'columns',
  valueFormat = defaultFmt,
  height,
  ...p
}: CommonProps & { categoryKey: string; categoryLabel?: string; layout?: 'columns' | 'bars' }) {
  const data = p.data ?? [];
  const horizontal = layout === 'bars';
  const h = height ?? (horizontal ? Math.max(160, data.length * (p.series.length * 26 + 14) + 40) : 260);
  return (
    <ChartFrame
      title={p.title}
      description={p.description}
      loading={p.loading}
      actions={p.actions}
      className={p.className}
      legend={<Legend series={p.series} shape="rect" />}
      table={<DataTableView data={data} xKey={categoryKey} xLabel={categoryLabel} series={p.series} valueFormat={valueFormat} xFormat={(v) => String(v)} />}
    >
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} barGap={2} barCategoryGap="24%" margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--chart-grid)" />
            {horizontal ? (
              <>
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={valueFormat} />
                <YAxis type="category" dataKey={categoryKey} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--chart-baseline)' }} width={140} />
              </>
            ) : (
              <>
                <XAxis dataKey={categoryKey} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--chart-baseline)' }} interval={0} minTickGap={4} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={valueFormat} allowDecimals={false} />
              </>
            )}
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={String(label)}
                    rows={p.series.map((s, i) => {
                      const v = payload.find((x) => x.dataKey === s.key)?.value;
                      return { key: s.key, label: s.label, value: v === undefined || v === null ? '—' : valueFormat(Number(v)), color: color(s, i), shape: 'rect' };
                    })}
                  />
                ) : null
              }
            />
            {p.series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={color(s, i)}
                maxBarSize={24}
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                activeBar={{ fillOpacity: 0.85 }}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

export { WeekHourHeatmap } from './heatmap';

/** Same-ramp meter: fill carries severity, track is a lighter step of the fill. */
export function Meter({ value, max, label, tone = 'normal' }: { value: number; max: number; label: string; tone?: 'normal' | 'warning' | 'critical' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = tone === 'critical' ? 'var(--status-critical)' : tone === 'warning' ? 'var(--status-warning)' : 'var(--chart-1)';
  return (
    <div className="grid gap-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: `color-mix(in oklab, ${fill} 18%, transparent)` }} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  );
}
