import { convertUnit, round2, Unit } from '@foodgrid/utils';

export interface BatchLike {
  id: string;
  remainingQty: number;
  unitCost: number;
  expiresAt: Date | null;
  receivedAt: Date;
}

export interface Allocation {
  batchId: string;
  quantity: number;
  unitCost: number;
}

/**
 * First-Expired-First-Out allocation. Batches without expiry are used after
 * dated ones, oldest receipt first. Returns the shortfall when stock on hand
 * (by batch) is insufficient; the caller still records the full consumption.
 */
export function allocateFefo(batches: BatchLike[], quantity: number): { allocations: Allocation[]; shortfall: number } {
  const ordered = [...batches]
    .filter((b) => b.remainingQty > 0)
    .sort((a, b) => {
      const ea = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const eb = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return ea - eb || a.receivedAt.getTime() - b.receivedAt.getTime();
    });
  let remaining = quantity;
  const allocations: Allocation[] = [];
  for (const b of ordered) {
    if (remaining <= 1e-9) break;
    const take = Math.min(b.remainingQty, remaining);
    allocations.push({ batchId: b.id, quantity: round3(take), unitCost: b.unitCost });
    remaining -= take;
  }
  return { allocations, shortfall: round3(Math.max(0, remaining)) };
}

/** Moving weighted-average cost after a receipt. */
export function weightedAverageCost(onHand: number, avgCost: number, receivedQty: number, receivedCost: number): number {
  const base = Math.max(0, onHand);
  const total = base + receivedQty;
  if (total <= 0) return receivedCost;
  return Math.round(((base * avgCost + receivedQty * receivedCost) / total) * 10000) / 10000;
}

export interface RecipeLine {
  ingredientId: string;
  quantity: number;
  unit: Unit;
  wastagePct: number;
}

/**
 * Ingredient requirement (in each ingredient's own stock unit) for `portions`
 * of a recipe that yields `yieldQty` portions.
 */
export function recipeRequirements(
  lines: RecipeLine[],
  ingredientUnits: Map<string, Unit>,
  portions: number,
  yieldQty = 1,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of lines) {
    const target = ingredientUnits.get(line.ingredientId);
    if (!target) continue;
    const perPortion = (line.quantity * (1 + line.wastagePct / 100)) / (yieldQty || 1);
    const qty = convertUnit(perPortion * portions, line.unit, target);
    out.set(line.ingredientId, round3((out.get(line.ingredientId) ?? 0) + qty));
  }
  return out;
}

export type StockState = 'OK' | 'LOW' | 'OUT';

export function stockState(current: number, reorderLevel: number): StockState {
  if (current <= 0) return 'OUT';
  if (current <= reorderLevel) return 'LOW';
  return 'OK';
}

/** True when a decrement moves stock from above the reorder level to at/below it. */
export function crossedReorderLevel(before: number, after: number, reorderLevel: number): boolean {
  return before > reorderLevel && after <= reorderLevel;
}

export const round3 = (v: number) => Math.round(v * 1000) / 1000;
export { round2 };
