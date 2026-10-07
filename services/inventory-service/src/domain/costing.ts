import { convertUnit, round2, Unit } from '@foodgrid/utils';

export interface CostLine {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: Unit;
  wastagePct: number;
  ingredientUnit: Unit;
  avgUnitCost: number;
}

export interface RecipeCost {
  perPortion: number;
  lines: {
    ingredientId: string;
    name: string;
    quantity: number;
    unit: Unit;
    cost: number;
    sharePct: number;
  }[];
}

/** Theoretical plate cost from the recipe and weighted-average ingredient costs. */
export function recipeCost(lines: CostLine[], yieldQty = 1): RecipeCost {
  const costed = lines.map((l) => {
    const effective = l.quantity * (1 + l.wastagePct / 100);
    const inStockUnit = convertUnit(effective, l.unit, l.ingredientUnit);
    return {
      ingredientId: l.ingredientId,
      name: l.name,
      quantity: l.quantity,
      unit: l.unit,
      cost: (inStockUnit * l.avgUnitCost) / (yieldQty || 1),
    };
  });
  const total = costed.reduce((s, c) => s + c.cost, 0);
  return {
    perPortion: round2(total),
    lines: costed.map((c) => ({
      ...c,
      cost: round2(c.cost),
      sharePct: total ? round2((c.cost / total) * 100) : 0,
    })),
  };
}

export interface MenuCostRow {
  menuItemId: string;
  name: string;
  sellingPrice: number;
  foodCost: number | null;
  foodCostPct: number | null;
  marginPct: number | null;
  flag: 'NO_RECIPE' | 'HIGH_COST' | 'OK';
}

/** Industry target: plate cost at or below ~30–35% of the selling price. */
export const HIGH_FOOD_COST_PCT = 35;

export function menuCostRow(
  menuItemId: string,
  name: string,
  sellingPrice: number,
  foodCost: number | null,
): MenuCostRow {
  if (foodCost === null)
    return {
      menuItemId,
      name,
      sellingPrice,
      foodCost,
      foodCostPct: null,
      marginPct: null,
      flag: 'NO_RECIPE',
    };
  const pct = sellingPrice > 0 ? round2((foodCost / sellingPrice) * 100) : 100;
  return {
    menuItemId,
    name,
    sellingPrice,
    foodCost,
    foodCostPct: pct,
    marginPct: round2(100 - pct),
    flag: pct > HIGH_FOOD_COST_PCT ? 'HIGH_COST' : 'OK',
  };
}
