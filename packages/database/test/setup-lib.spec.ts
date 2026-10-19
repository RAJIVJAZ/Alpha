import { circleZone, readSetupConfig } from '../scripts/setup-lib';

/** The ray casting delivery-service uses to find a pickup's zone (@foodgrid/utils pointInPolygon). */
function pointInPolygon(point: { lat: number; lng: number }, polygon: [number, number][]): boolean {
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

describe('production setup', () => {
  it('builds a closed city-wide ring that covers the city and stops at the radius', () => {
    const ring = circleZone({ lat: 12.9716, lng: 77.5946 }, 20);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // MG Road, Whitefield (~16 km) and Electronic City (~17 km) are in; Hosur (~37 km) is not
    expect(pointInPolygon({ lat: 12.9756, lng: 77.6066 }, ring)).toBe(true);
    expect(pointInPolygon({ lat: 12.9698, lng: 77.75 }, ring)).toBe(true);
    expect(pointInPolygon({ lat: 12.8452, lng: 77.6602 }, ring)).toBe(true);
    expect(pointInPolygon({ lat: 12.7409, lng: 77.8253 }, ring)).toBe(false);
  });

  it('defaults the zone to Bengaluru and needs a centre for any other city', () => {
    expect(readSetupConfig({}).zone).toEqual({
      city: 'Bengaluru',
      lat: 12.9716,
      lng: 77.5946,
      radiusKm: 20,
    });
    expect(() => readSetupConfig({ ZONE_CITY: 'Mumbai' })).toThrow(/ZONE_LAT and ZONE_LNG/);
    expect(
      readSetupConfig({
        ZONE_CITY: 'Mumbai',
        ZONE_LAT: '19.076',
        ZONE_LNG: '72.8777',
        ZONE_RADIUS_KM: '25',
      }).zone,
    ).toEqual({ city: 'Mumbai', lat: 19.076, lng: 72.8777, radiusKm: 25 });
    expect(readSetupConfig({ ZONE_CITY: 'none', ADMIN_EMAIL: 'a@b.in' }).zone).toBeNull();
  });

  it('checks the admin details and never accepts a short password', () => {
    const c = readSetupConfig({
      ADMIN_EMAIL: ' Founder@Example.IN ',
      ADMIN_PASSWORD: 'long-enough-pass',
      ZONE_CITY: 'none',
    });
    expect(c.admin).toEqual({
      email: 'founder@example.in',
      name: 'founder',
      password: 'long-enough-pass',
      resetPassword: false,
    });
    expect(() => readSetupConfig({ ADMIN_EMAIL: 'x@y.in', ADMIN_PASSWORD: 'short' })).toThrow(
      /at least 12/,
    );
    expect(() => readSetupConfig({ ADMIN_EMAIL: 'not-an-email' })).toThrow(/not an email/);
    expect(() => readSetupConfig({ ZONE_CITY: 'none' })).toThrow(/Nothing to do/);
  });
});
