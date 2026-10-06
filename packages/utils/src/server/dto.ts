import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

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
    value === undefined || value === '' ? undefined : Array.isArray(value) ? value : String(value).split(','),
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

/** Resolves a date range defaulting to the last `days` days (inclusive). */
export function resolveRange(q: DateRangeQueryDto, days = 30): { from: Date; to: Date } {
  const to = q.to ? new Date(`${q.to.slice(0, 10)}T23:59:59.999Z`) : new Date();
  const from = q.from ? new Date(`${q.from.slice(0, 10)}T00:00:00.000Z`) : new Date(to.getTime() - (days - 1) * 86_400_000);
  if (!q.from) from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}
