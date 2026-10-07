import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@foodgrid/database';
import { money } from '@foodgrid/utils';
import { map, Observable } from 'rxjs';

/** Wire format for amounts: rupees as a string with exactly two decimals ("700.00"). */
export function toMoney(value: Prisma.Decimal | number | string): string {
  return Prisma.Decimal.isDecimal(value) ? value.toFixed(2) : money(value);
}

const isPlainObject = (v: object) => {
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};

/**
 * Replaces Prisma Decimals anywhere in a value with two-decimal strings.
 * Decimal.toJSON drops trailing zeros ("700" for 700.00); every Decimal column
 * this service reads is numeric(_, 2) money or a 2-dp rate, so two decimals is
 * the column's own scale. A value with more decimals keeps them rather than
 * being rounded.
 */
export function withMoneyStrings<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Prisma.Decimal.isDecimal(value)) {
    const d = value as Prisma.Decimal;
    return (d.decimalPlaces() <= 2 ? d.toFixed(2) : d.toString()) as T;
  }
  if (Array.isArray(value)) return value.map(withMoneyStrings) as T;
  if (!isPlainObject(value)) return value; // Dates and other class instances serialise themselves
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = withMoneyStrings(v);
  return out as T;
}

/** Applies withMoneyStrings to every HTTP response body of the service. */
@Injectable()
export class MoneyJsonInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(withMoneyStrings));
  }
}
