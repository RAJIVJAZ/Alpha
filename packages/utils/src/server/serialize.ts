/**
 * Converts Prisma results into JSON-safe values: Decimal -> fixed string,
 * BigInt -> string. Dates are left for JSON.stringify (ISO).
 */
export function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as T;
}
