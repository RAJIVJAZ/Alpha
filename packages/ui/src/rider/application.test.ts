/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applicationBody, canReapply, documentsFor, type ApplicationForm } from './application';

const form: ApplicationForm = {
  name: ' Ishaan Bhat ',
  city: 'Bengaluru ',
  vehicleType: 'SCOOTER',
  vehicleNumber: 'ka-03 mr 4364',
  licenseNumber: ' KA0320190012345 ',
  upiId: '',
};
const documents = { ID_PROOF: 'https://cdn/kyc/id.jpg', DRIVING_LICENSE: 'https://cdn/kyc/dl.pdf' };

test('a motorised vehicle sends its number, licence and both documents', () => {
  assert.deepEqual(applicationBody(form, documents), {
    name: 'Ishaan Bhat',
    city: 'Bengaluru',
    vehicleType: 'SCOOTER',
    vehicleNumber: 'KA03MR4364',
    licenseNumber: 'KA0320190012345',
    documents: [
      { kind: 'ID_PROOF', url: 'https://cdn/kyc/id.jpg' },
      { kind: 'DRIVING_LICENSE', url: 'https://cdn/kyc/dl.pdf' },
    ],
  });
});

test('a bicycle sends no vehicle number, licence or licence document; UPI when given', () => {
  assert.deepEqual(documentsFor('BICYCLE'), ['ID_PROOF']);
  assert.deepEqual(
    applicationBody({ ...form, vehicleType: 'BICYCLE', upiId: ' ishaan@okaxis ' }, documents),
    {
      name: 'Ishaan Bhat',
      city: 'Bengaluru',
      vehicleType: 'BICYCLE',
      upiId: 'ishaan@okaxis',
      documents: [{ kind: 'ID_PROOF', url: 'https://cdn/kyc/id.jpg' }],
    },
  );
});

test('only a rejected application, or one with changes requested, can be sent again', () => {
  assert.equal(canReapply({ status: 'REJECTED', rejectionReason: 'Blurred licence' }), true);
  assert.equal(canReapply({ status: 'PENDING_APPROVAL', rejectionReason: 'Add the RC' }), true);
  assert.equal(canReapply({ status: 'PENDING_APPROVAL', rejectionReason: null }), false);
  assert.equal(canReapply({ status: 'ACTIVE', rejectionReason: null }), false);
});
