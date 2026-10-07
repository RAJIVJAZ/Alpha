import { decodeGeohash, encodeGeohash, LatLng, round2 } from '@foodgrid/utils';

export interface HeatCell {
  geohash: string;
  lat: number;
  lng: number;
  demand: number;
  riders: number;
  /** demand per available rider; > 1 means under-supplied. */
  pressure: number;
}

/** Aggregates demand points and rider positions into geohash cells. */
export function buildHeatmap(demand: LatLng[], riders: LatLng[], precision = 6): HeatCell[] {
  const cells = new Map<string, { demand: number; riders: number }>();
  for (const p of demand) {
    const h = encodeGeohash(p.lat, p.lng, precision);
    const c = cells.get(h) ?? { demand: 0, riders: 0 };
    c.demand++;
    cells.set(h, c);
  }
  for (const p of riders) {
    const h = encodeGeohash(p.lat, p.lng, precision);
    const c = cells.get(h) ?? { demand: 0, riders: 0 };
    c.riders++;
    cells.set(h, c);
  }
  return [...cells.entries()]
    .map(([geohash, c]) => {
      const center = decodeGeohash(geohash);
      return {
        geohash,
        lat: round2(center.lat * 1e4) / 1e4,
        lng: round2(center.lng * 1e4) / 1e4,
        demand: c.demand,
        riders: c.riders,
        pressure: round2(c.demand / Math.max(1, c.riders)),
      };
    })
    .sort((a, b) => b.pressure - a.pressure || b.demand - a.demand);
}
