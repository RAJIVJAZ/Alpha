/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  businessBody,
  canResubmit,
  documentsFor,
  kycBody,
  sentDocuments,
  type BusinessForm,
} from './application';

const form: BusinessForm = {
  type: 'RESTAURANT',
  name: ' Spice Route ',
  legalName: '',
  pan: 'aabcs1234k',
  gstin: '',
  fssaiLicense: ' 12345678901234 ',
  email: '',
  phone: '+919845000001',
  addressLine1: ' 12, MG Road ',
  city: 'Bengaluru',
  state: 'Karnataka ',
  pincode: '560001',
};
const uploads = {
  PAN: 'https://cdn/kyc/pan.pdf',
  GST_CERTIFICATE: 'https://cdn/kyc/gst.pdf',
  FSSAI_LICENSE: 'https://cdn/kyc/fssai.jpg',
};

test('an application sends the numbers given, each with its document, and no blank fields', () => {
  assert.deepEqual(businessBody(form, uploads), {
    type: 'RESTAURANT',
    name: 'Spice Route',
    pan: 'AABCS1234K',
    fssaiLicense: '12345678901234',
    phone: '+919845000001',
    addressLine1: '12, MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    kycDocuments: [
      { kind: 'PAN', url: 'https://cdn/kyc/pan.pdf', number: 'AABCS1234K' },
      { kind: 'FSSAI_LICENSE', url: 'https://cdn/kyc/fssai.jpg', number: '12345678901234' },
    ],
  });
});

test('a GSTIN asks for its certificate; the PAN card is always asked for', () => {
  assert.deepEqual(documentsFor({ gstin: '29AABCS1234K1ZC', fssaiLicense: '' }), [
    'PAN',
    'GST_CERTIFICATE',
  ]);
});

test('a resubmission sends every document and only the identifiers that changed', () => {
  const tenant = {
    legalName: null,
    pan: 'AABCS1234K',
    gstin: null,
    fssaiLicense: '11111111111111',
  };
  assert.deepEqual(kycBody(form, tenant, uploads), {
    fssaiLicense: '12345678901234',
    documents: [
      { kind: 'PAN', url: 'https://cdn/kyc/pan.pdf', number: 'AABCS1234K' },
      { kind: 'FSSAI_LICENSE', url: 'https://cdn/kyc/fssai.jpg', number: '12345678901234' },
    ],
  });
});

test('keeps documents sent earlier only when they are web links', () => {
  assert.deepEqual(
    sentDocuments([
      { kind: 'PAN', url: 'https://cdn/kyc/pan.pdf' },
      { kind: 'GST_CERTIFICATE', url: 's3://foodgrid-kyc/demo/gst.pdf' },
      { url: 'https://cdn/kyc/unknown.pdf' },
    ]),
    { PAN: 'https://cdn/kyc/pan.pdf' },
  );
  assert.deepEqual(sentDocuments(null), {});
});

test('only a rejected application, or one asked for changes, can be resubmitted', () => {
  assert.equal(canResubmit({ status: 'REJECTED', rejectionReason: 'Expired licence' }), true);
  assert.equal(canResubmit({ status: 'PENDING_APPROVAL', rejectionReason: 'Add GST' }), true);
  assert.equal(canResubmit({ status: 'PENDING_APPROVAL', rejectionReason: null }), false);
  assert.equal(canResubmit({ status: 'PENDING_APPROVAL' }), false);
  assert.equal(canResubmit({ status: 'ACTIVE', rejectionReason: null }), false);
});
