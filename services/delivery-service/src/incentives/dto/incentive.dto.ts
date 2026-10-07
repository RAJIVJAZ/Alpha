import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class IncentiveSchemeDto {
  @ApiProperty({ example: 'Weekend warrior: 40 orders' }) @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty({ enum: ['ORDER_COUNT', 'PEAK_HOURS', 'LOGIN_HOURS', 'STREAK', 'RATING'] })
  @IsIn(['ORDER_COUNT', 'PEAK_HOURS', 'LOGIN_HOURS', 'STREAK', 'RATING'])
  type!: 'ORDER_COUNT' | 'PEAK_HOURS' | 'LOGIN_HOURS' | 'STREAK' | 'RATING';
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiProperty({ example: 40 }) @IsInt() @Min(1) target!: number;
  @ApiProperty({ example: 600 }) @IsNumber() @Min(1) rewardAmount!: number;
  @ApiPropertyOptional({ example: [{ start: '12:00', end: '14:30' }] })
  @IsOptional()
  @IsArray()
  peakWindows?: { start: string; end: string }[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() minRating?: number;
  @ApiProperty() @IsDateString() startsAt!: string;
  @ApiProperty() @IsDateString() endsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateIncentiveSchemeDto extends PartialType(IncentiveSchemeDto) {}
