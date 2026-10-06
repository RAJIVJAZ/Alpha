import { addDays, inverseNormalCdf, mape, mean, round2, stdDev } from '@foodgrid/utils';

export interface DemandSignal {
  date: string;
  impact: number;
  name?: string;
  categories?: string[];
}

export interface ForecastInput {
  /** Daily values, oldest first. */
  series: number[];
  /** Date (YYYY-MM-DD) of series[0]. */
  startDate: string;
  horizon: number;
  seasonLength?: number;
  signals?: DemandSignal[];
  category?: string;
  /** Two-sided prediction interval coverage (default 80%). */
  intervalCoverage?: number;
}

export interface ForecastPoint {
  date: string;
  value: number;
  lower: number;
  upper: number;
  baseline: number;
  multiplier: number;
  signals: string[];
}

export interface ForecastResult {
  model: 'HOLT_WINTERS' | 'SEASONAL_NAIVE' | 'MOVING_AVERAGE' | 'ZERO';
  params?: { alpha: number; beta: number; gamma: number; phi: number };
  mape: number | null;
  residualStd: number;
  points: ForecastPoint[];
}

interface HwState {
  level: number;
  trend: number;
  seasonals: number[];
  sse: number;
  residuals: number[];
}

/** Additive Holt-Winters with damped trend; returns the state after the last observation. */
export function fitHoltWinters(y: number[], m: number, alpha: number, beta: number, gamma: number, phi: number): HwState {
  const first = y.slice(0, m);
  const second = y.slice(m, 2 * m);
  let level = mean(first);
  let trend = (mean(second) - mean(first)) / m;
  const seasonals = first.map((v) => v - level);
  let sse = 0;
  const residuals: number[] = [];
  for (let t = m; t < y.length; t++) {
    const s = seasonals[t % m]!;
    const forecast = level + phi * trend + s;
    const err = y[t]! - forecast;
    sse += err * err;
    residuals.push(err);
    const prevLevel = level;
    level = alpha * (y[t]! - s) + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
    seasonals[t % m] = gamma * (y[t]! - level) + (1 - gamma) * s;
  }
  return { level, trend, seasonals, sse, residuals };
}

function hwForecast(state: HwState, n: number, m: number, h: number, phi: number): number {
  let damp = 0;
  for (let i = 1; i <= h; i++) damp += phi ** i;
  return state.level + damp * state.trend + state.seasonals[(n + h - 1) % m]!;
}

const GRID = {
  alpha: [0.1, 0.2, 0.35, 0.5],
  beta: [0, 0.05, 0.15],
  gamma: [0.1, 0.25, 0.4],
};
const PHI = 0.9;

function bestHoltWinters(y: number[], m: number) {
  let best: { alpha: number; beta: number; gamma: number; state: HwState } | null = null;
  for (const alpha of GRID.alpha)
    for (const beta of GRID.beta)
      for (const gamma of GRID.gamma) {
        const state = fitHoltWinters(y, m, alpha, beta, gamma, PHI);
        if (!best || state.sse < best.state.sse) best = { alpha, beta, gamma, state };
      }
  return best!;
}

function signalMultiplier(date: string, signals: DemandSignal[], category?: string) {
  let multiplier = 1;
  const names: string[] = [];
  for (const s of signals) {
    if (s.date !== date) continue;
    if (category && s.categories?.length && !s.categories.includes(category)) continue;
    multiplier *= s.impact;
    if (s.name) names.push(s.name);
  }
  return { multiplier, names };
}

/**
 * Daily demand forecast.
 *  - ≥ 14 observations: damped additive Holt-Winters (weekly seasonality),
 *    parameters chosen by grid search on one-step-ahead SSE.
 *  - 7–13: seasonal naive blended with the mean.
 *  - < 7: moving average.
 * Historic festival/weather effects are divided out before fitting and future
 * ones multiplied back in. Prediction intervals widen with √h.
 */
export function forecastDemand(input: ForecastInput): ForecastResult {
  const m = input.seasonLength ?? 7;
  const signals = input.signals ?? [];
  const start = new Date(`${input.startDate}T00:00:00Z`);
  const dateAt = (i: number) => addDays(start, i).toISOString().slice(0, 10);
  const z = inverseNormalCdf(0.5 + (input.intervalCoverage ?? 0.8) / 2);

  const y = input.series.map((v, i) => {
    const clean = Math.max(0, Number.isFinite(v) ? v : 0);
    return clean / signalMultiplier(dateAt(i), signals, input.category).multiplier;
  });
  const n = y.length;

  let baseline: (h: number) => number;
  let model: ForecastResult['model'];
  let params: ForecastResult['params'];
  let residualStd: number;
  let holdoutMape: number | null = null;

  if (n === 0 || y.every((v) => v === 0)) {
    model = 'ZERO';
    baseline = () => 0;
    residualStd = 0;
  } else if (n >= 2 * m) {
    model = 'HOLT_WINTERS';
    const best = bestHoltWinters(y, m);
    params = { alpha: best.alpha, beta: best.beta, gamma: best.gamma, phi: PHI };
    baseline = (h) => hwForecast(best.state, n, m, h, PHI);
    residualStd = stdDev(best.state.residuals);
    if (n >= 6 * m) {
      const hold = 2 * m;
      const train = y.slice(0, n - hold);
      const s = fitHoltWinters(train, m, best.alpha, best.beta, best.gamma, PHI);
      const predicted = Array.from({ length: hold }, (_, i) => Math.max(0, hwForecast(s, train.length, m, i + 1, PHI)));
      holdoutMape = round2(mape(y.slice(n - hold), predicted));
    }
  } else if (n >= m) {
    model = 'SEASONAL_NAIVE';
    const avg = mean(y);
    baseline = (h) => 0.6 * y[n - m + ((h - 1) % m)]! + 0.4 * avg;
    residualStd = stdDev(y.slice(m).map((v, i) => v - y[i]!)) || stdDev(y);
  } else {
    model = 'MOVING_AVERAGE';
    const avg = mean(y);
    baseline = () => avg;
    residualStd = stdDev(y);
  }

  const points: ForecastPoint[] = [];
  for (let h = 1; h <= input.horizon; h++) {
    const date = dateAt(n + h - 1);
    const base = Math.max(0, baseline(h));
    const { multiplier, names } = signalMultiplier(date, signals, input.category);
    const value = base * multiplier;
    const spread = z * residualStd * Math.sqrt(h) * multiplier;
    points.push({
      date,
      value: round2(value),
      lower: round2(Math.max(0, value - spread)),
      upper: round2(value + spread),
      baseline: round2(base),
      multiplier: round2(multiplier),
      signals: names,
    });
  }
  return { model, params, mape: holdoutMape, residualStd: round2(residualStd), points };
}

/**
 * Walks the forecast until cumulative demand exceeds stock. Returns the
 * fractional days of cover and the depletion date (null if beyond horizon).
 */
export function predictDepletion(currentStock: number, points: Pick<ForecastPoint, 'date' | 'value'>[]) {
  if (currentStock <= 0) return { daysOfCover: 0, depletionDate: points[0]?.date ?? null };
  let remaining = currentStock;
  for (let i = 0; i < points.length; i++) {
    const demand = points[i]!.value;
    if (demand >= remaining) {
      return { daysOfCover: round2(i + (demand > 0 ? remaining / demand : 0)), depletionDate: points[i]!.date };
    }
    remaining -= demand;
  }
  const avg = mean(points.map((p) => p.value));
  return { daysOfCover: avg > 0 ? round2(points.length + remaining / avg) : Number.POSITIVE_INFINITY, depletionDate: null };
}
