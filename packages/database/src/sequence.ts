import type { DbClient } from './client';

/**
 * Atomically increments and returns a named counter. Uses a single
 * INSERT ... ON CONFLICT statement so it is safe under concurrency and can
 * participate in the caller's transaction.
 */
export async function nextSequence(db: DbClient, name: string): Promise<bigint> {
  const rows = await db.$queryRaw<{ value: bigint }[]>`
    INSERT INTO "platform"."SequenceCounter" ("name", "value", "updatedAt")
    VALUES (${name}, 1, now())
    ON CONFLICT ("name") DO UPDATE
      SET "value" = "platform"."SequenceCounter"."value" + 1, "updatedAt" = now()
    RETURNING "value"`;
  return BigInt(rows[0]!.value);
}

/** YYMMDD in Asia/Kolkata — business days roll over at IST midnight. */
export function istDateStamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}`;
}

/**
 * Human-readable, day-partitioned document numbers, e.g. ORD-261006-00042,
 * PO-261006-00007, INV-261006-00123.
 */
export async function generateDocumentNumber(
  db: DbClient,
  prefix: string,
  date: Date = new Date(),
  pad = 5,
): Promise<string> {
  const stamp = istDateStamp(date);
  const seq = await nextSequence(db, `${prefix}-${stamp}`);
  return `${prefix}-${stamp}-${seq.toString().padStart(pad, '0')}`;
}
