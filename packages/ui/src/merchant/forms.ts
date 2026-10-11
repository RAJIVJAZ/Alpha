/**
 * Form state → request body for the merchant master-data dialogs (ingredients,
 * recipes, dishes). Each builder throws an Error with a message for the merchant
 * when the input can't work; the services still validate everything.
 */

const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

// ─── ingredients ────────────────────────────────────────────────────────────

export interface IngredientForm {
  name: string;
  sku: string;
  category: string;
  unit: string;
  reorderLevel: string;
  reorderQty: string;
  maxStock: string;
  leadTimeDays: string;
  shelfLifeDays: string;
  openingStock: string;
  openingUnitCost: string;
}

/** SKU suggestion from the name: "Maida (refined flour)" → "MAIDA-REFINED-FLOUR". */
export const skuFromName = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');

/** POST body when `outletId` is given, else the PATCH body for an existing ingredient. */
export function ingredientBody(f: IngredientForm, outletId?: string) {
  const reorderLevel = num(f.reorderLevel) ?? 0;
  const maxStock = num(f.maxStock);
  if (maxStock !== undefined && maxStock < reorderLevel)
    throw new Error('Max stock must be at least the reorder level');
  const common = {
    name: f.name.trim(),
    sku: f.sku.trim().toUpperCase(),
    category: f.category,
    reorderLevel,
    reorderQty: num(f.reorderQty) ?? 0,
    leadTimeDays: num(f.leadTimeDays),
  };
  // the unit stays fixed once created: stock, batches and recipes are counted in it
  if (!outletId)
    return { ...common, maxStock: maxStock ?? null, shelfLifeDays: num(f.shelfLifeDays) ?? null };
  const openingStock = num(f.openingStock);
  const openingUnitCost = num(f.openingUnitCost);
  if (openingStock && openingUnitCost === undefined)
    throw new Error('Enter the cost per unit of the opening stock');
  return {
    ...common,
    outletId,
    unit: f.unit,
    maxStock,
    shelfLifeDays: num(f.shelfLifeDays),
    openingStock,
    openingUnitCost,
  };
}

// ─── recipes ────────────────────────────────────────────────────────────────

export interface RecipeLineForm {
  ingredientId: string;
  quantity: string;
  unit: string;
  wastagePct: string;
}

// mirrors canConvert in @foodgrid/utils; smaller unit first as the recipe default
const RECIPE_UNITS: Record<string, string[]> = {
  KG: ['G', 'KG'],
  G: ['G', 'KG'],
  L: ['ML', 'L'],
  ML: ['ML', 'L'],
  PCS: ['PCS', 'DOZEN'],
  DOZEN: ['PCS', 'DOZEN'],
};

/** Units a recipe line may use for an ingredient stocked in `stockUnit`. */
export const recipeUnits = (stockUnit: string) => RECIPE_UNITS[stockUnit] ?? [stockUnit];

export function recipeLines(lines: RecipeLineForm[]) {
  if (!lines.length) throw new Error('Add at least one ingredient');
  const seen = new Set<string>();
  return lines.map((l) => {
    if (seen.has(l.ingredientId))
      throw new Error('Each ingredient can appear once — add the quantities together');
    seen.add(l.ingredientId);
    return {
      ingredientId: l.ingredientId,
      quantity: Number(l.quantity),
      unit: l.unit,
      wastagePct: num(l.wastagePct) ?? 0,
    };
  });
}

// ─── dishes ─────────────────────────────────────────────────────────────────

export interface VariantForm {
  name: string;
  priceDelta: string;
  isAvailable: boolean;
}
export interface AddonForm {
  name: string;
  price: string;
  isVeg: boolean;
  isAvailable: boolean;
}
export interface AddonGroupForm {
  name: string;
  minSelect: string;
  maxSelect: string;
  addons: AddonForm[];
}
export interface DishForm {
  categoryId: string;
  name: string;
  description: string;
  price: string;
  isVeg: boolean;
  kdsStation: string;
  variants: VariantForm[];
  /** Index of the size preselected for customers. */
  defaultVariant: number;
  addonGroups: AddonGroupForm[];
}

/** Body for POST merchant/outlets/:id/items and PATCH merchant/items/:id (variants and add-ons are replaced). */
export function dishBody(f: DishForm) {
  const price = Number(f.price);
  // removing the preselected size falls back to the last remaining one
  const preselected = Math.min(f.defaultVariant, f.variants.length - 1);
  const variants = f.variants.map((v, i) => {
    const priceDelta = num(v.priceDelta) ?? 0;
    if (price + priceDelta < 0) throw new Error(`${v.name} would cost less than ₹0`);
    return {
      name: v.name.trim(),
      priceDelta,
      isDefault: i === preselected,
      isAvailable: v.isAvailable,
    };
  });
  const addonGroups = f.addonGroups.map((g) => {
    const minSelect = num(g.minSelect) ?? 0;
    const maxSelect = num(g.maxSelect) ?? 1;
    if (!g.addons.length) throw new Error(`Add at least one option to ${g.name}`);
    if (minSelect > maxSelect)
      throw new Error(`${g.name}: the minimum to pick can't be more than the maximum`);
    if (minSelect > g.addons.length)
      throw new Error(`${g.name}: customers must pick ${minSelect} but there are fewer options`);
    return {
      name: g.name.trim(),
      minSelect,
      maxSelect,
      addons: g.addons.map((a) => ({
        name: a.name.trim(),
        price: num(a.price) ?? 0,
        isVeg: a.isVeg,
        isAvailable: a.isAvailable,
      })),
    };
  });
  return {
    categoryId: f.categoryId,
    name: f.name.trim(),
    description: f.description.trim() || null,
    price,
    isVeg: f.isVeg,
    kdsStation: f.kdsStation,
    variants,
    addonGroups,
  };
}
