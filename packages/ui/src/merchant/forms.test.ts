/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dishBody,
  ingredientBody,
  recipeLines,
  recipeUnits,
  skuFromName,
  type DishForm,
  type IngredientForm,
} from './forms';

const ingredient: IngredientForm = {
  name: ' Maida ',
  sku: 'maida',
  category: 'FLOUR',
  unit: 'KG',
  reorderLevel: '10',
  reorderQty: '',
  maxStock: '',
  leadTimeDays: '',
  shelfLifeDays: '',
  openingStock: '',
  openingUnitCost: '42',
};

test('skuFromName makes a short upper-case code', () => {
  assert.equal(skuFromName('Maida (refined flour)'), 'MAIDA-REFINED-FLOUR');
  assert.equal(skuFromName('  ghee  '), 'GHEE');
  assert.equal(skuFromName('a'.repeat(39) + ' b').length, 39);
});

test('ingredientBody creates with the outlet, unit and cost; blanks become defaults', () => {
  assert.deepEqual(ingredientBody(ingredient, 'out_1'), {
    name: 'Maida',
    sku: 'MAIDA',
    category: 'FLOUR',
    reorderLevel: 10,
    reorderQty: 0,
    leadTimeDays: undefined,
    outletId: 'out_1',
    unit: 'KG',
    maxStock: undefined,
    shelfLifeDays: undefined,
    openingStock: undefined,
    openingUnitCost: 42,
  });
});

test('ingredientBody edits without the unit and clears blank limits', () => {
  const body = ingredientBody({ ...ingredient, leadTimeDays: '3' });
  assert.equal('unit' in body, false);
  assert.equal('outletId' in body, false);
  assert.equal(body.maxStock, null);
  assert.equal(body.shelfLifeDays, null);
  assert.equal(body.leadTimeDays, 3);
});

test('ingredientBody rejects a max stock below the reorder level and stock without a cost', () => {
  assert.throws(() => ingredientBody({ ...ingredient, maxStock: '5' }), /at least the reorder/);
  assert.throws(
    () => ingredientBody({ ...ingredient, openingStock: '3', openingUnitCost: '' }, 'out_1'),
    /cost per unit/,
  );
  assert.equal(ingredientBody({ ...ingredient, maxStock: '10' }).maxStock, 10);
});

test('recipeUnits offers the same unit family, smallest first', () => {
  assert.deepEqual(recipeUnits('KG'), ['G', 'KG']);
  assert.deepEqual(recipeUnits('ML'), ['ML', 'L']);
  assert.deepEqual(recipeUnits('PACK'), ['PACK']);
});

test('recipeLines converts quantities and refuses empty or repeated ingredients', () => {
  assert.deepEqual(
    recipeLines([{ ingredientId: 'a', quantity: '150', unit: 'G', wastagePct: '' }]),
    [{ ingredientId: 'a', quantity: 150, unit: 'G', wastagePct: 0 }],
  );
  assert.throws(() => recipeLines([]), /at least one/);
  const line = { ingredientId: 'a', quantity: '1', unit: 'G', wastagePct: '5' };
  assert.throws(() => recipeLines([line, line]), /once/);
});

const dish: DishForm = {
  categoryId: 'cat_1',
  name: 'Biryani',
  description: '  ',
  price: '200',
  isVeg: false,
  kdsStation: 'MAIN',
  variants: [
    { name: 'Half', priceDelta: '-80', isAvailable: true },
    { name: 'Full', priceDelta: '', isAvailable: false },
  ],
  defaultVariant: 1,
  addonGroups: [
    {
      name: 'Extras',
      minSelect: '',
      maxSelect: '2',
      addons: [{ name: 'Raita', price: '30', isVeg: true, isAvailable: true }],
    },
  ],
};

test('dishBody maps sizes, the preselected size and add-on groups', () => {
  const body = dishBody(dish);
  assert.equal(body.description, null);
  assert.deepEqual(body.variants, [
    { name: 'Half', priceDelta: -80, isDefault: false, isAvailable: true },
    { name: 'Full', priceDelta: 0, isDefault: true, isAvailable: false },
  ]);
  assert.deepEqual(body.addonGroups, [
    {
      name: 'Extras',
      minSelect: 0,
      maxSelect: 2,
      addons: [{ name: 'Raita', price: 30, isVeg: true, isAvailable: true }],
    },
  ]);
  // the preselected size was removed: the last remaining one takes over
  const one = dishBody({ ...dish, variants: dish.variants.slice(0, 1) });
  assert.equal(one.variants[0]!.isDefault, true);
});

test('dishBody refuses negative prices and add-on groups customers cannot satisfy', () => {
  assert.throws(() => dishBody({ ...dish, price: '50' }), /less than ₹0/);
  const group = dish.addonGroups[0]!;
  assert.throws(
    () => dishBody({ ...dish, addonGroups: [{ ...group, addons: [] }] }),
    /at least one/,
  );
  assert.throws(
    () => dishBody({ ...dish, addonGroups: [{ ...group, minSelect: '3', maxSelect: '2' }] }),
    /can't be more/,
  );
  assert.throws(
    () => dishBody({ ...dish, addonGroups: [{ ...group, minSelect: '2', maxSelect: '2' }] }),
    /fewer options/,
  );
});
