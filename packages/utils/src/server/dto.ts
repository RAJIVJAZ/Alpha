import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { istDate } from '../time';

/** Body of internal batch lookups: `{ ids: [...] }` (at most 500). */
export class IdsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];
}

/** Parses "true"/"false"/"1"/"0" query strings correctly (implicit conversion would not). */
export const ToBoolean = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (typeof raw === 'boolean') return raw;
    return ['true', '1', 'yes'].includes(String(raw).toLowerCase());
  });

/** Splits comma-separated query values into arrays. */
export const ToArray = () =>
  Transform(({ value }: { value: unknown }) =>
    value === undefined || value === ''
      ? undefined
      : Array.isArray(value)
        ? value
        : String(value).split(','),
  );

export class PageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

/**
 * Date range for `@db.Date` columns (which already hold IST business dates):
 * UTC-midnight bounds, defaulting to the last `days` days (inclusive).
 * Filtering timestamp columns? Use resolveIstRange.
 */
export function resolveRange(q: DateRangeQueryDto, days = 30): { from: Date; to: Date } {
  const to = q.to ? new Date(`${q.to.slice(0, 10)}T23:59:59.999Z`) : new Date();
  const from = q.from
    ? new Date(`${q.from.slice(0, 10)}T00:00:00.000Z`)
    : new Date(to.getTime() - (days - 1) * 86_400_000);
  if (!q.from) from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

const IST_OFFSET_MS = 330 * 60_000;
const istDayStart = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00.000Z`) - IST_OFFSET_MS);

/**
 * Range for timestamp columns where `from`/`to` are IST business dates: from
 * 00:00 IST on `from` to the last millisecond of `to` in IST. Defaults to the
 * last `days` IST days including today (ending now).
 */
export function resolveIstRange(q: DateRangeQueryDto, days = 30): { from: Date; to: Date } {
  const to = q.to
    ? new Date(istDayStart(q.to.slice(0, 10)).getTime() + 86_400_000 - 1)
    : new Date();
  const fromDay = q.from
    ? q.from.slice(0, 10)
    : istDate(new Date(to.getTime() - (days - 1) * 86_400_000));
  return { from: istDayStart(fromDay), to };
}
