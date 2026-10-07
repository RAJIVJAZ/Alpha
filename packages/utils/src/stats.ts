export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);

export function variance(xs: number[], sample = true): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - (sample ? 1 : 0));
}

export const stdDev = (xs: number[], sample = true) => Math.sqrt(variance(xs, sample));

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** Min-max normalisation into [0,1]; `invert` for lower-is-better metrics. */
export function normalize(value: number, min: number, max: number, invert = false): number {
  if (max === min) return 1;
  const n = clamp((value - min) / (max - min), 0, 1);
  return invert ? 1 - n : n;
}

/** Mean absolute percentage error, ignoring zero actuals. */
export function mape(actual: number[], predicted: number[]): number {
  const pairs = actual.map((a, i) => [a, predicted[i] ?? 0] as const).filter(([a]) => a !== 0);
  if (!pairs.length) return 0;
  return mean(pairs.map(([a, p]) => Math.abs((a - p) / a))) * 100;
}

/** Inverse standard normal CDF (Acklam's approximation). */
export function inverseNormalCdf(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError('p must be in (0,1)');
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972,
    -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
