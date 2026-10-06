export type Unit = 'KG' | 'G' | 'L' | 'ML' | 'PCS' | 'PACK' | 'DOZEN' | 'BOX';

/** Unit families and their factor to the family's base unit. */
const FAMILY: Record<Unit, { family: string; factor: number }> = {
  KG: { family: 'mass', factor: 1000 },
  G: { family: 'mass', factor: 1 },
  L: { family: 'volume', factor: 1000 },
  ML: { family: 'volume', factor: 1 },
  PCS: { family: 'count', factor: 1 },
  DOZEN: { family: 'count', factor: 12 },
  PACK: { family: 'pack', factor: 1 },
  BOX: { family: 'box', factor: 1 },
};

export class UnitConversionError extends Error {}

export function canConvert(from: Unit, to: Unit): boolean {
  return FAMILY[from].family === FAMILY[to].family;
}

/** Converts `quantity` expressed in `from` into `to`. */
export function convertUnit(quantity: number, from: Unit, to: Unit): number {
  if (from === to) return quantity;
  const a = FAMILY[from];
  const b = FAMILY[to];
  if (a.family !== b.family) {
    throw new UnitConversionError(`Cannot convert ${from} to ${to}`);
  }
  return (quantity * a.factor) / b.factor;
}
