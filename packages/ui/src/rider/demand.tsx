'use client';

import * as React from 'react';
import { Navigation } from 'lucide-react';
import { ChartFrame } from '../charts/frame';
import { Button } from '../components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import { PageHeader } from '../components/layout';
import { formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Heatmap, RiderProfile } from './types';

// sequential blue ramp (light → dark) for demand pressure; status colours stay reserved
const RAMP = ['#cfe1f7', '#9fc3ef', '#6aa2e4', '#3987e5', '#1f66c2', '#13498e'];
const W = 640;
const H = 440;
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const shortZone = (name: string) => name.replace(/^[^-]+ - /, '');

/** Ray-casting point-in-polygon on a GeoJSON ring of [lng, lat] pairs. */
function inRing(lat: number, lng: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Where the orders are: delivery zones, demand per area and surge, with the rider's position. */
export function DemandMap() {
  const heat = useApi<Heatmap>('riders/heatmap', undefined, { refetchInterval: 30_000 });
  const me = useApi<RiderProfile & { currentLat: number | null; currentLng: number | null }>(
    'riders/me',
  );
  const [hover, setHover] = React.useState<string | null>(null);
  const h = heat.data;

  const view = React.useMemo(() => {
    if (!h) return null;
    const pts: [number, number][] = [
      ...h.zones.flatMap((z) => z.polygon).map(([lng, lat]) => [lat!, lng!] as [number, number]),
      ...h.cells.map((c) => [c.lat, c.lng] as [number, number]),
    ];
    if (!pts.length) return null;
    const lats = pts.map((p) => p[0]);
    const lngs = pts.map((p) => p[1]);
    const [minLat, maxLat, minLng, maxLng] = [
      Math.min(...lats),
      Math.max(...lats),
      Math.min(...lngs),
      Math.max(...lngs),
    ];
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanX = (maxLng - minLng) * kx || 0.01;
    const spanY = maxLat - minLat || 0.01;
    const scale = Math.min((W - 40) / spanX, (H - 40) / spanY);
    const ox = (W - spanX * scale) / 2;
    const oy = (H - spanY * scale) / 2;
    const project = (lat: number, lng: number) =>
      [ox + (lng - minLng) * kx * scale, H - oy - (lat - minLat) * scale] as const;
    const maxDemand = Math.max(1, ...h.cells.map((c) => c.demand));
    const maxPressure = Math.max(1, ...h.cells.map((c) => c.pressure));
    // zones overlap at the edges: of the zones containing a cell, take the one whose centre is nearest
    const centres = h.zones.map((z) => {
      const ring = z.polygon;
      return {
        z,
        lng: ring.reduce((a, p) => a + p[0]!, 0) / Math.max(1, ring.length),
        lat: ring.reduce((a, p) => a + p[1]!, 0) / Math.max(1, ring.length),
      };
    });
    const areaOf = (c: { lat: number; lng: number }) => {
      const hits = centres.filter(({ z }) => inRing(c.lat, c.lng, z.polygon));
      const best = hits.sort(
        (a, b) =>
          (a.lat - c.lat) ** 2 +
          (a.lng - c.lng) ** 2 -
          ((b.lat - c.lat) ** 2 + (b.lng - c.lng) ** 2),
      )[0];
      return best ? shortZone(best.z.name) : 'Outside zones';
    };
    return { project, maxDemand, maxPressure, areaOf };
  }, [h]);

  const tone = (pressure: number) =>
    RAMP[
      Math.min(
        RAMP.length - 1,
        Math.floor((pressure / (view?.maxPressure ?? 1)) * (RAMP.length - 1)),
      )
    ]!;
  const myPos =
    me.data?.currentLat && me.data.currentLng && view
      ? view.project(me.data.currentLat, me.data.currentLng)
      : null;
  const here =
    me.data?.currentLat && me.data.currentLng
      ? { lat: me.data.currentLat, lng: me.data.currentLng }
      : null;
  const top = (h?.cells ?? [])
    .filter((c) => c.demand > 0)
    .sort((a, b) => b.pressure - a.pressure || b.demand - a.demand)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Demand map"
        description={
          h
            ? `Open orders against riders nearby · updated ${formatRelative(h.generatedAt)}`
            : 'Where orders are waiting'
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <ChartFrame
          title="Demand by area"
          description="Circle size = open orders; darker = more orders per available rider"
          loading={heat.isFetching && !h}
          legend={
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                Fewer
                {RAMP.map((c) => (
                  <span key={c} className="inline-block h-2.5 w-4" style={{ background: c }} />
                ))}
                More orders per rider
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-2.5 rounded-full border-2 border-[var(--chart-2)] bg-white" />{' '}
                You
              </span>
            </div>
          }
          table={
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Area</th>
                  <th className="py-1 pr-3 text-right font-medium">Open orders</th>
                  <th className="py-1 pr-3 text-right font-medium">Riders</th>
                  <th className="py-1 text-right font-medium">Orders per rider</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {(h?.cells ?? []).map((c) => (
                  <tr key={c.geohash} className="border-t">
                    <td className="py-1 pr-3">
                      {view?.areaOf(c)}{' '}
                      <span className="font-mono text-xs text-muted-foreground">{c.geohash}</span>
                    </td>
                    <td className="py-1 pr-3 text-right">{c.demand}</td>
                    <td className="py-1 pr-3 text-right">{c.riders}</td>
                    <td className="py-1 text-right">{c.pressure}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          {view && h ? (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full"
              role="img"
              aria-label="Map of delivery zones with demand circles"
            >
              {h.zones.map((z) => (
                <polygon
                  key={z.id}
                  points={z.polygon
                    .map(([lng, lat]) => view.project(lat!, lng!).join(','))
                    .join(' ')}
                  fill="var(--chart-1)"
                  fillOpacity={0.04}
                  stroke="var(--chart-baseline)"
                  strokeWidth={1}
                />
              ))}
              {h.cells.map((c) => {
                const [x, y] = view.project(c.lat, c.lng);
                const r = 6 + 18 * Math.sqrt(c.demand / view.maxDemand);
                return (
                  <circle
                    key={c.geohash}
                    cx={x}
                    cy={y}
                    r={hover === c.geohash ? r + 2 : r}
                    fill={tone(c.pressure)}
                    fillOpacity={0.85}
                    stroke="var(--chart-surface)"
                    strokeWidth={2}
                    onMouseEnter={() => setHover(c.geohash)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${view.areaOf(c)}: ${c.demand} open orders, ${c.riders} riders nearby`}</title>
                  </circle>
                );
              })}
              {/* labels last, with a surface halo, so overlapping zones and circles never hide them */}
              {h.zones.map((z) => {
                const ring = z.polygon.map(([lng, lat]) => view.project(lat!, lng!));
                const cx = ring.reduce((s, p) => s + p[0], 0) / Math.max(1, ring.length);
                const cy = ring.reduce((s, p) => s + p[1], 0) / Math.max(1, ring.length);
                return (
                  <text
                    key={z.id}
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--chart-text)"
                    stroke="var(--chart-surface)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    pointerEvents="none"
                  >
                    {shortZone(z.name)}
                    {z.surge > 1 ? (
                      <tspan x={cx} dy={13} fontWeight={600}>
                        {z.surge}× pay
                      </tspan>
                    ) : null}
                  </text>
                );
              })}
              {myPos ? (
                <circle
                  cx={myPos[0]}
                  cy={myPos[1]}
                  r={7}
                  fill="white"
                  stroke="var(--chart-2)"
                  strokeWidth={3}
                />
              ) : null}
            </svg>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No open demand right now.
            </p>
          )}
        </ChartFrame>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Busiest spots</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {top.map((c) => (
              <div key={c.geohash} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{view?.areaOf(c)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.demand} open order{c.demand === 1 ? '' : 's'} · {c.riders} rider
                    {c.riders === 1 ? '' : 's'} nearby
                    {here ? ` · ${haversineKm(here, c).toFixed(1)} km from you` : ''}
                  </span>
                </span>
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=two-wheeler`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Navigate to ${view?.areaOf(c) ?? 'this area'}`}
                  >
                    <Navigation />
                  </a>
                </Button>
              </div>
            ))}
            {h && !top.length ? <p className="text-muted-foreground">Quiet right now.</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
