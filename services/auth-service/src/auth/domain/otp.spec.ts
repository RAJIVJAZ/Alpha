import { generateOtp, hashOtp, verifyOtpHash } from './otp';
import { maskPhone, normalizePhone } from './phone';
import { generateReferralCode } from './referral';

describe('OTP primitives', () => {
  it('generates 6-digit codes', () => {
    for (let i = 0; i < 50; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });
  it('binds the hash to phone and code', () => {
    const h = hashOtp('pepper', '+919876543210', '123456');
    expect(verifyOtpHash('pepper', '+919876543210', '123456', h)).toBe(true);
    expect(verifyOtpHash('pepper', '+919876543211', '123456', h)).toBe(false);
    expect(verifyOtpHash('pepper', '+919876543210', '654321', h)).toBe(false);
    expect(verifyOtpHash('other', '+919876543210', '123456', h)).toBe(false);
  });
});

describe('phone normalisation', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['+14155552671', '+14155552671'],
  ])('%s -> %s', (input, expected) => expect(normalizePhone(input)).toBe(expected));

  it('rejects invalid numbers', () => {
    expect(() => normalizePhone('12345')).toThrow();
    expect(() => normalizePhone('5876543210')).toThrow(); // Indian mobiles start with 6-9
  });
  it('masks numbers', () => expect(maskPhone('+919876543210')).toBe('+91******3210'));
});

describe('referral codes', () => {
  it('avoids ambiguous characters', () => {
    for (let i = 0; i < 50; i++) expect(generateReferralCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });
});
