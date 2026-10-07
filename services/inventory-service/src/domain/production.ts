/** Same-weekday weighted average (most recent week weighs most). */
export function forecastItemDemand(
  series: { date: string; quantity: number }[],
  targetDate: Date,
): number {
  const target = targetDate.getUTCDay();
  const byDate = new Map(series.map((s) => [s.date, s.quantity]));
  const weights = [0.4, 0.3, 0.2, 0.1];
  let weighted = 0;
  let weightSum = 0;
  for (let w = 1; w <= 4; w++) {
    const d = new Date(targetDate.getTime() - w * 7 * 86_400_000);
    if (d.getUTCDay() !== target) continue;
    const q = byDate.get(d.toISOString().slice(0, 10));
    if (q === undefined) continue;
    weighted += q * weights[w - 1]!;
    weightSum += weights[w - 1]!;
  }
  if (weightSum > 0) return weighted / weightSum;
  if (!series.length) return 0;
  return (
    series.reduce((s, x) => s + x.quantity, 0) /
    Math.max(1, new Set(series.map((x) => x.date)).size)
  );
}

/** Planned production = forecast plus a buffer, rounded up to whole portions. */
export function plannedQuantity(forecast: number, bufferPct = 10): number {
  return forecast <= 0 ? 0 : Math.ceil(forecast * (1 + bufferPct / 100));
}
