/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanHours, outletBody, outletForm, savedLocation, type OutletForm } from './outlet-form';

const filled = (over: Partial<OutletForm> = {}): OutletForm => ({
  ...outletForm('RESTAURANT'),
  name: ' Spice Route ',
  addressLine1: '80 Feet Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560034',
  lat: '12.9352',
  lng: '77.6245',
  cuisines: 'North Indian, Biryani, north indian, , Biryani',
  ...over,
});

test('a new restaurant starts with lunch and dinner every day, a cart with one shift and QR on', () => {
  const r = outletForm('RESTAURANT');
  assert.equal(r.hours.length, 14);
  assert.equal(r.acceptsQrOrders, false);
  const c = outletForm('FOOD_CART');
  assert.equal(c.hours.length, 7);
  assert.equal(c.acceptsQrOrders, true);
  assert.equal(c.acceptsDineIn, false);
  assert.equal(c.deliveryRadiusKm, '3');
});

test('outletBody trims, de-duplicates and keeps the type only on create', () => {
  const create = outletBody(filled(), { create: true });
  assert.equal('type' in create && create.type, 'RESTAURANT');
  assert.equal(create.name, 'Spice Route');
  assert.deepEqual(create.cuisines, ['North Indian', 'Biryani', 'north indian']);
  assert.equal(create.lat, 12.9352);
  assert.deepEqual(create.kdsStations, ['MAIN']);
  assert.equal(create.description, undefined);
  const update = outletBody(filled(), { create: false });
  assert.equal('type' in update, false);
  assert.equal(update.description, '');
});

test('an update clears emptied optional fields and keeps a moved cart where it is', () => {
  const update = outletBody(filled({ logoUrl: '', gstin: ' ', fssaiNumber: '' }), {
    create: false,
  });
  assert.equal(update.logoUrl, null);
  assert.equal(update.gstin, null);
  assert.equal(update.fssaiNumber, null);
  assert.equal(update.addressLine2, null);
  assert.equal(outletBody(filled({ logoUrl: '' }), { create: true }).logoUrl, undefined);
  // unchanged coordinates are left out, so "I'm here now" is not undone by a later save
  const saved = savedLocation({ lat: 12.9352, lng: 77.6245 });
  assert.equal('lat' in outletBody(filled(), { create: false, location: saved }), false);
  const moved = outletBody(filled({ lat: '12.94' }), { create: false, location: saved });
  assert.deepEqual([moved.lat, moved.lng], [12.94, 77.6245]);
});

test('a cloud kitchen saves with dine-in and QR off, and still needs a way to order', () => {
  const kitchen = filled({ type: 'CLOUD_KITCHEN', acceptsDineIn: true, acceptsQrOrders: true });
  const body = outletBody(kitchen, { create: true });
  assert.equal(body.acceptsDineIn, false);
  assert.equal(body.acceptsQrOrders, false);
  assert.throws(
    () =>
      outletBody({ ...kitchen, acceptsDelivery: false, acceptsTakeaway: false }, { create: true }),
    /at least one way/,
  );
});

test('outletBody refuses what the outlet cannot go live with', () => {
  const bad: [Partial<OutletForm>, RegExp][] = [
    [{ name: ' ' }, /outlet name/],
    [{ pincode: '5600' }, /PIN code/],
    [{ lat: '' }, /location/],
    [{ lng: '200' }, /location/],
    [{ fssaiNumber: '123' }, /14 digits/],
    [{ deliveryRadiusKm: '40' }, /0.5 and 25/],
    [{ avgPrepTimeMins: '2.5' }, /1 to 180/],
    [{ costForTwo: '-5' }, /positive/],
    [
      {
        acceptsDelivery: false,
        acceptsTakeaway: false,
        acceptsDineIn: false,
        acceptsQrOrders: false,
      },
      /at least one way/,
    ],
  ];
  for (const [over, msg] of bad)
    assert.throws(() => outletBody(filled(over), { create: true }), msg);
});

test('stations are upper-case codes; hours are checked and sorted', () => {
  const b = outletBody(filled({ kdsStations: 'main, tandoor, Bar!, main' }), { create: true });
  assert.deepEqual(b.kdsStations, ['MAIN', 'TANDOOR', 'BAR']);
  assert.deepEqual(
    cleanHours([
      { day: 2, open: '18:00', close: '01:00' },
      { day: 1, open: '11:00', close: '15:00' },
    ]).map((w) => w.day),
    [1, 2],
  );
  assert.throws(() => cleanHours([{ day: 0, open: '9:00', close: '17:00' }]), /HH:MM/);
  assert.throws(() => cleanHours([{ day: 3, open: '10:00', close: '10:00' }]), /must differ/);
});
