import { estimateRoadKm, LatLng, round2 } from '@foodgrid/utils';

export interface Stop extends LatLng {
  id: string;
  type: 'PICKUP' | 'DROP';
  /** Pickup and drop of the same order share an orderId. */
  orderId: string;
  label?: string;
}

export interface RouteInput {
  start: LatLng;
  stops: Stop[];
  avgSpeedKmph?: number;
  serviceMins?: { PICKUP: number; DROP: number };
}

export interface RoutedStop extends Stop {
  sequence: number;
  legKm: number;
  cumulativeKm: number;
  etaMins: number;
}

export interface RouteResult {
  stops: RoutedStop[];
  totalKm: number;
  totalMins: number;
  improvedByKm: number;
  navigationUrl: string;
}

/** A sequence is valid when every drop comes after its pickup. */
export function isFeasible(seq: Stop[]): boolean {
  const picked = new Set<string>();
  for (const s of seq) {
    if (s.type === 'PICKUP') picked.add(s.orderId);
    else if (
      !picked.has(s.orderId) &&
      seq.some((x) => x.type === 'PICKUP' && x.orderId === s.orderId)
    )
      return false;
  }
  return true;
}

export function routeLength(start: LatLng, seq: Stop[]): number {
  let km = 0;
  let prev: LatLng = start;
  for (const s of seq) {
    km += estimateRoadKm(prev, s);
    prev = s;
  }
  return km;
}

/** Greedy nearest-feasible construction respecting pickup-before-drop. */
function nearestNeighbour(start: LatLng, stops: Stop[]): Stop[] {
  const remaining = [...stops];
  const picked = new Set<string>();
  const hasPickup = new Set(stops.filter((s) => s.type === 'PICKUP').map((s) => s.orderId));
  const route: Stop[] = [];
  let cur: LatLng = start;
  while (remaining.length) {
    const candidates = remaining.filter(
      (s) => s.type === 'PICKUP' || !hasPickup.has(s.orderId) || picked.has(s.orderId),
    );
    candidates.sort((a, b) => estimateRoadKm(cur, a) - estimateRoadKm(cur, b));
    const next = candidates[0]!;
    route.push(next);
    if (next.type === 'PICKUP') picked.add(next.orderId);
    remaining.splice(remaining.indexOf(next), 1);
    cur = next;
  }
  return route;
}

/** 2-opt segment reversal + relocate moves, keeping only feasible improvements. */
function improve(start: LatLng, route: Stop[], maxIterations = 200): Stop[] {
  let best = route;
  let bestLen = routeLength(start, best);
  for (let iter = 0, improved = true; improved && iter < maxIterations; iter++) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const reversed = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const len = routeLength(start, reversed);
        if (len + 1e-9 < bestLen && isFeasible(reversed)) {
          best = reversed;
          bestLen = len;
          improved = true;
        }
      }
    }
    for (let i = 0; i < best.length; i++) {
      for (let j = 0; j < best.length; j++) {
        if (i === j) continue;
        const moved = [...best];
        const [node] = moved.splice(i, 1);
        moved.splice(j, 0, node!);
        const len = routeLength(start, moved);
        if (len + 1e-9 < bestLen && isFeasible(moved)) {
          best = moved;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Pickup & delivery route optimisation for a rider (single order or batch). */
export function optimizeRoute(input: RouteInput): RouteResult {
  const speed = input.avgSpeedKmph ?? 22;
  const service = input.serviceMins ?? { PICKUP: 5, DROP: 3 };
  const initial = nearestNeighbour(input.start, input.stops);
  const initialLen = routeLength(input.start, initial);
  const route = improve(input.start, initial);

  let prev: LatLng = input.start;
  let cumulativeKm = 0;
  let minutes = 0;
  const stops = route.map((s, idx) => {
    const legKm = estimateRoadKm(prev, s);
    cumulativeKm += legKm;
    minutes += (legKm / speed) * 60;
    const eta = Math.round(minutes);
    minutes += service[s.type];
    prev = s;
    return {
      ...s,
      sequence: idx + 1,
      legKm: round2(legKm),
      cumulativeKm: round2(cumulativeKm),
      etaMins: eta,
    };
  });

  const destination = route[route.length - 1];
  const waypoints = route
    .slice(0, -1)
    .map((s) => `${s.lat},${s.lng}`)
    .join('|');
  const navigationUrl = destination
    ? `https://www.google.com/maps/dir/?api=1&origin=${input.start.lat},${input.start.lng}&destination=${destination.lat},${destination.lng}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}&travelmode=two-wheeler`
    : '';
  return {
    stops,
    totalKm: round2(cumulativeKm),
    totalMins: Math.round(minutes),
    improvedByKm: round2(initialLen - cumulativeKm),
    navigationUrl,
  };
}
