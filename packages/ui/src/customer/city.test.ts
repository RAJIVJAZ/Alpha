/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CITIES, cityFor } from './city';

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('the site opens in Prayagraj unless the deployment names another city', () => {
  assert.equal(cityFor(undefined).name, 'Prayagraj');
  assert.equal(cityFor('').state, 'Uttar Pradesh');
  assert.equal(cityFor(' Bengaluru ').name, 'Bengaluru');
  assert.equal(cityFor('atlantis').name, 'Prayagraj');
});

test("every area shortcut lies within its city's 15-20 km delivery zone", () => {
  const zone = {
    prayagraj: [{ lat: 25.4448, lng: 81.8432 }, 15],
    bengaluru: [{ lat: 12.9716, lng: 77.5946 }, 20],
  } as const;
  for (const c of Object.values(CITIES)) {
    const [centre, radius] = zone[c.key as keyof typeof zone];
    for (const a of c.areas) {
      assert.ok(a.label.endsWith(`, ${c.name}`), a.label);
      assert.ok(km(centre, a) < radius, `${a.label} is ${km(centre, a).toFixed(1)} km out`);
    }
  }
});
