import {
  boundingBox,
  decodeGeohash,
  encodeGeohash,
  geohashCover,
  geohashNeighbours,
  haversineKm,
  pointInPolygon,
  travelMinutes,
} from './geo';

const MG_ROAD = { lat: 12.9756, lng: 77.6066 };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };

describe('geo', () => {
  it('computes haversine distance', () => {
    expect(haversineKm(MG_ROAD, KORAMANGALA)).toBeCloseTo(4.88, 1);
    expect(haversineKm(MG_ROAD, MG_ROAD)).toBe(0);
  });
  it('encodes and decodes geohashes', () => {
    const hash = encodeGeohash(MG_ROAD.lat, MG_ROAD.lng, 7);
    expect(hash).toHaveLength(7);
    expect(hash.startsWith('tdr1')).toBe(true);
    const decoded = decodeGeohash(hash);
    expect(Math.abs(decoded.lat - MG_ROAD.lat)).toBeLessThan(0.002);
    expect(Math.abs(decoded.lng - MG_ROAD.lng)).toBeLessThan(0.002);
  });
  it('returns 9 neighbouring cells', () => {
    const n = geohashNeighbours(encodeGeohash(MG_ROAD.lat, MG_ROAD.lng, 6));
    expect(n).toHaveLength(9);
  });
  it('covers a radius with coarser cells', () => {
    const cover = geohashCover(MG_ROAD, 6);
    expect(cover[0]).toHaveLength(4);
    expect(cover.some((c) => encodeGeohash(KORAMANGALA.lat, KORAMANGALA.lng, 4) === c)).toBe(true);
  });
  it('tests polygon containment', () => {
    const square: [number, number][] = [
      [77.5, 12.9],
      [77.7, 12.9],
      [77.7, 13.0],
      [77.5, 13.0],
      [77.5, 12.9],
    ];
    expect(pointInPolygon(MG_ROAD, square)).toBe(true);
    expect(pointInPolygon({ lat: 13.2, lng: 77.6 }, square)).toBe(false);
  });
  it('builds bounding boxes and travel times', () => {
    const box = boundingBox(MG_ROAD, 5);
    expect(box.maxLat - box.minLat).toBeCloseTo(0.09, 2);
    expect(travelMinutes(11)).toBe(30);
  });
});
