import { badRequest } from '@foodgrid/utils';

/** Same normalisation rules as auth-service (bare 10 digits => +91). */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  const phone = /^\d{10}$/.test(digits) ? `+91${digits}` : digits.startsWith('+') ? digits : `+${digits}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw badRequest('Invalid phone number', 'INVALID_PHONE');
  return phone;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 60);
}
