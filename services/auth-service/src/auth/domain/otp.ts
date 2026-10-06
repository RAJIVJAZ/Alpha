import { randomInt } from 'node:crypto';
import { hmacSha256, safeEqual } from '@foodgrid/auth';

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 300;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_PER_IP_PER_HOUR = 30;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

/** Peppered HMAC binding the code to the phone number. */
export function hashOtp(secret: string, phone: string, code: string): string {
  return hmacSha256(secret, `${phone}:${code}`);
}

export function verifyOtpHash(secret: string, phone: string, code: string, hash: string): boolean {
  return safeEqual(hashOtp(secret, phone, code), hash);
}

export const otpKeys = {
  cooldown: (phone: string) => `otp:cooldown:${phone}`,
  hourly: (phone: string) => `otp:hourly:${phone}`,
  ip: (ip: string) => `otp:ip:${ip}`,
};
