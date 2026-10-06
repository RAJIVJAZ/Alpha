import { badRequest } from '@foodgrid/utils';

/**
 * Normalises phone numbers to E.164. Bare 10-digit numbers are treated as
 * Indian mobiles (+91). Indian mobiles must start with 6-9.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  let phone: string;
  if (/^\d{10}$/.test(digits)) phone = `+91${digits}`;
  else if (/^0\d{10}$/.test(digits)) phone = `+91${digits.slice(1)}`;
  else if (/^91\d{10}$/.test(digits)) phone = `+${digits}`;
  else phone = digits.startsWith('+') ? digits : `+${digits}`;

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw badRequest('Invalid phone number', 'INVALID_PHONE');
  if (phone.startsWith('+91') && !/^\+91[6-9]\d{9}$/.test(phone)) {
    throw badRequest('Invalid Indian mobile number', 'INVALID_PHONE');
  }
  return phone;
}

export const maskPhone = (phone: string) => `${phone.slice(0, 3)}******${phone.slice(-4)}`;
