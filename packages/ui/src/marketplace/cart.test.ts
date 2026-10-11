/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bySeller,
  cartTotals,
  nextQty,
  putLine,
  qtyError,
  removeLine,
  segmentFor,
  unitPrice,
  type MarketProduct,
} from './cart';

const product = (over: Partial<MarketProduct> = {}): MarketProduct =>
  ({
    id: 'p1',
    tenantId: 'seller_a',
    seller: { tenantId: 'seller_a', sellerName: 'Annapurna' },
    name: 'Atta 25 kg',
    price: '1150',
    gstRate: '5',
    moq: '2',
    stepQty: '1',
    maxOrderQty: null,
    stockQty: '40',
    priceTiers: [],
    ...over,
  }) as MarketProduct;

test('unitPrice takes the highest tier reached, preferring the buyer segment', () => {
  const p = product({
    priceTiers: [
      { minQty: '10', maxQty: null, unitPrice: '1100', segment: 'ALL' },
      { minQty: '10', maxQty: null, unitPrice: '1080', segment: 'RETAILER' },
      { minQty: '50', maxQty: null, unitPrice: '1050', segment: 'ALL' },
      { minQty: '1', maxQty: null, unitPrice: '900', segment: 'ALL', validTo: '2026-01-01' },
    ],
  });
  const at = new Date('2026-10-11');
  assert.equal(unitPrice(p, 5, 'RESTAURANT', at), 1150); // expired promo ignored
  assert.equal(unitPrice(p, 10, 'RESTAURANT', at), 1100);
  assert.equal(unitPrice(p, 10, 'RETAILER', at), 1080);
  assert.equal(unitPrice(p, 60, 'RETAILER', at), 1050);
});

test('unitPrice respects a tier capped by maxQty', () => {
  const p = product({
    priceTiers: [{ minQty: '1', maxQty: '2', unitPrice: '999', segment: 'ALL' }],
  });
  assert.equal(unitPrice(p, 2, 'RESTAURANT'), 999);
  assert.equal(unitPrice(p, 3, 'RESTAURANT'), 1150);
});

test('segmentFor maps business types like the service', () => {
  assert.equal(segmentFor('RETAILER'), 'RETAILER');
  assert.equal(segmentFor('WHOLESALER'), 'RETAILER');
  assert.equal(segmentFor('FOOD_CART'), 'RESTAURANT');
  assert.equal(segmentFor(undefined), 'RESTAURANT');
});

test('qtyError checks MOQ, steps, max per order and stock', () => {
  const p = product({ moq: '5', stepQty: '5', maxOrderQty: '50', stockQty: '30' });
  assert.equal(qtyError(p, 0), 'Enter a quantity');
  assert.equal(qtyError(p, 3), 'Minimum order is 5 packs');
  assert.equal(qtyError(p, 7), 'Order 5 packs, then in steps of 5');
  assert.equal(qtyError(p, 55), 'At most 50 packs per order');
  assert.equal(qtyError(p, 35), 'Only 30 packs in stock');
  assert.equal(qtyError(p, 30), null);
  assert.equal(qtyError(product({ moq: '0.5', stepQty: '0.5' }), 1.5), null);
});

test('nextQty walks MOQ + steps and stops at max or stock', () => {
  const p = product({ moq: '3', stepQty: '2', maxOrderQty: null, stockQty: '8' });
  assert.equal(nextQty(p, 0, 1), 3);
  assert.equal(nextQty(p, 3, 1), 5);
  assert.equal(nextQty(p, 4, 1), 5); // off-step input snaps to the next valid quantity
  assert.equal(nextQty(p, 7, 1), null); // 9 is over the stock
  assert.equal(nextQty(p, 7, -1), 5);
  assert.equal(nextQty(p, 6, -1), 5);
  assert.equal(nextQty(p, 3, -1), null); // below the MOQ: remove instead
  assert.equal(nextQty(product({ moq: '0.5', stepQty: '0.1' }), 0.5, 1), 0.6);
});

test('putLine adds or replaces; bySeller groups one order per seller', () => {
  const a = product();
  const b = product({ id: 'p2', name: 'Sugar' });
  const c = product({
    id: 'p3',
    tenantId: 'seller_b',
    seller: { tenantId: 'seller_b', sellerName: 'Bharat' },
  });
  let lines = putLine([], a, 2);
  lines = putLine(lines, c, 1);
  lines = putLine(lines, b, 4);
  lines = putLine(lines, a, 6);
  assert.deepEqual(
    lines.map((l) => [l.product.id, l.quantity]),
    [
      ['p1', 6],
      ['p3', 1],
      ['p2', 4],
    ],
  );
  assert.deepEqual(
    bySeller(lines).map((g) => [g.sellerName, g.lines.map((l) => l.product.id)]),
    [
      ['Annapurna', ['p1', 'p2']],
      ['Bharat', ['p3']],
    ],
  );
  assert.deepEqual(
    removeLine(lines, 'p1').map((l) => l.product.id),
    ['p3', 'p2'],
  );
});

test('cartTotals prices each line at its tier and adds GST per line', () => {
  const tiered = product({
    priceTiers: [{ minQty: '10', maxQty: null, unitPrice: '1100', segment: 'ALL' }],
  });
  const oil = product({ id: 'p2', price: '1999.99', gstRate: '18' });
  assert.deepEqual(
    cartTotals(
      [
        { product: tiered, quantity: 10 },
        { product: oil, quantity: 3 },
      ],
      'RESTAURANT',
    ),
    // 11000 + 5999.97; GST 550 + 1079.99
    { subtotal: 16999.97, gst: 1629.99, total: 18629.96 },
  );
});
