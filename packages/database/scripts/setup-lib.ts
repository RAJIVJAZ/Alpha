/** Pure helpers for scripts/setup.ts (first-time production setup), unit-tested. */

const EARTH_KM_PER_DEG_LAT = 110.574;
const EARTH_KM_PER_DEG_LNG_AT_EQUATOR = 111.32;

/**
 * A closed ring of [lng, lat] points (the DeliveryZone.polygon format) approximating a circle
 * of `radiusKm` around the centre: a city-wide delivery zone without gaps between localities.
 */
export function circleZone(
  centre: { lat: number; lng: number },
  radiusKm: number,
  points = 32,
): [number, number][] {
  const latDeg = radiusKm / EARTH_KM_PER_DEG_LAT;
  const lngDeg =
    radiusKm / (EARTH_KM_PER_DEG_LNG_AT_EQUATOR * Math.cos((centre.lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (2 * Math.PI * i) / points;
    ring.push([
      round6(centre.lng + lngDeg * Math.cos(a)),
      round6(centre.lat + latDeg * Math.sin(a)),
    ]);
  }
  ring.push(ring[0]!);
  return ring;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface SetupConfig {
  admin: { email: string; name: string; password?: string; resetPassword: boolean } | null;
  zone: { city: string; lat: number; lng: number; radiusKm: number } | null;
}

/** Reads and checks the setup options; throws an Error listing every problem. */
export function readSetupConfig(env: Record<string, string | undefined>): SetupConfig {
  const problems: string[] = [];
  let admin: SetupConfig['admin'] = null;
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      problems.push('ADMIN_EMAIL is not an email address');
    const name = env.ADMIN_NAME?.trim() || email.split('@')[0]!;
    const password = env.ADMIN_PASSWORD;
    if (password !== undefined && password.length < 12)
      problems.push('ADMIN_PASSWORD must be at least 12 characters');
    if (password !== undefined && password.length > 128)
      problems.push('ADMIN_PASSWORD must be at most 128 characters');
    admin = { email, name, password, resetPassword: env.ADMIN_RESET_PASSWORD === 'true' };
  }
  let zone: SetupConfig['zone'] = null;
  if (env.ZONE_CITY !== 'none') {
    const city = env.ZONE_CITY?.trim() || 'Bengaluru';
    const lat = num(env.ZONE_LAT, city === 'Bengaluru' ? 12.9716 : NaN);
    const lng = num(env.ZONE_LNG, city === 'Bengaluru' ? 77.5946 : NaN);
    const radiusKm = num(env.ZONE_RADIUS_KM, 20);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180)
      problems.push(`Set ZONE_LAT and ZONE_LNG to the centre of ${city}`);
    if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 60)
      problems.push('ZONE_RADIUS_KM must be between 1 and 60');
    zone = { city, lat, lng, radiusKm };
  }
  if (!admin && !zone) problems.push('Nothing to do: set ADMIN_EMAIL and/or the ZONE_* options');
  if (problems.length) throw new Error(problems.join('\n'));
  return { admin, zone };
}

const num = (v: string | undefined, fallback: number) =>
  v === undefined || v.trim() === '' ? fallback : Number(v);
