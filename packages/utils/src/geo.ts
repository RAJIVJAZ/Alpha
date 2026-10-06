export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Approximate road distance. Indian urban road networks typically add
 * 30-40% over straight-line distance; used when no routing engine result
 * is available.
 */
export function estimateRoadKm(a: LatLng, b: LatLng, circuity = 1.35): number {
  return haversineKm(a, b) * circuity;
}

/** Initial bearing from a to b in degrees (0 = north). */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Travel time estimate in minutes for an average urban two-wheeler speed. */
export function travelMinutes(distanceKm: number, avgSpeedKmph = 22): number {
  return Math.max(1, Math.round((distanceKm / avgSpeedKmph) * 60));
}

// ─── Geohash ────────────────────────────────────────────────────────────────
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lng: number, precision = 6): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngMin = mid;
      } else {
        ch <<= 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch <<= 1;
        latMax = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export function decodeGeohash(hash: string): LatLng & { latErr: number; lngErr: number } {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let even = true;
  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) throw new Error(`Invalid geohash character: ${c}`);
    for (let n = 4; n >= 0; n--) {
      const bitN = (idx >> n) & 1;
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (bitN) lngMin = mid;
        else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitN) latMin = mid;
        else latMax = mid;
      }
      even = !even;
    }
  }
  return {
    lat: (latMin + latMax) / 2,
    lng: (lngMin + lngMax) / 2,
    latErr: (latMax - latMin) / 2,
    lngErr: (lngMax - lngMin) / 2,
  };
}

/** The cell plus its 8 neighbours — used for "nearby" pre-filtering. */
export function geohashNeighbours(hash: string): string[] {
  const { lat, lng, latErr, lngErr } = decodeGeohash(hash);
  const out = new Set<string>();
  for (const dLat of [-1, 0, 1]) {
    for (const dLng of [-1, 0, 1]) {
      const nLat = Math.max(-89.999, Math.min(89.999, lat + dLat * latErr * 2));
      let nLng = lng + dLng * lngErr * 2;
      if (nLng > 180) nLng -= 360;
      if (nLng < -180) nLng += 360;
      out.add(encodeGeohash(nLat, nLng, hash.length));
    }
  }
  return [...out];
}

/**
 * Geohash prefixes covering a radius. Picks a precision whose cell size is
 * at least the radius, then returns the 3x3 neighbourhood.
 */
export function geohashCover(center: LatLng, radiusKm: number): string[] {
  // approximate cell heights (km) for precisions 1..7
  const cellKm = [5000, 625, 156, 19.5, 4.89, 0.61, 0.153];
  let precision = 1;
  for (let p = 1; p <= cellKm.length; p++) {
    if (cellKm[p - 1]! >= radiusKm) precision = p;
  }
  return geohashNeighbours(encodeGeohash(center.lat, center.lng, precision));
}

/** Ray-casting point-in-polygon. polygon = [[lng, lat], ...] (GeoJSON order). */
export function pointInPolygon(point: LatLng, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Bounding box around a point, useful for SQL pre-filters. */
export function boundingBox(center: LatLng, radiusKm: number) {
  const latDelta = toDeg(radiusKm / EARTH_RADIUS_KM);
  const lngDelta = toDeg(radiusKm / (EARTH_RADIUS_KM * Math.cos(toRad(center.lat))));
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}
