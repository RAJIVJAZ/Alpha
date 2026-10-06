import { Prisma } from '../generated/client';

export type DecimalLike = Prisma.Decimal | number | string;

export const Decimal = Prisma.Decimal;

export function toDecimal(value: DecimalLike | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function toNumber(value: DecimalLike | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

/** Round half-up to 2 decimals (paise precision). */
export function roundMoney(value: DecimalLike): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
