import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OUTLET_TYPES, OutletType } from '@foodgrid/types';
import { PageQueryDto, ToArray, ToBoolean } from '@foodgrid/utils/server';

export class OpeningWindowDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday' })
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;
  @ApiProperty({ example: '11:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) open!: string;
  @ApiProperty({ example: '23:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) close!: string;
}

export class CreateOutletDto {
  @ApiProperty({ enum: OUTLET_TYPES }) @IsIn(OUTLET_TYPES) type!: OutletType;
  @ApiProperty({ example: 'Spice Route — Indiranagar' }) @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional({ type: [String], example: ['North Indian', 'Biryani'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  cuisines?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @ApiProperty() @IsString() @MaxLength(200) addressLine1!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) addressLine2?: string;
  @ApiProperty() @IsString() @MaxLength(80) city!: string;
  @ApiProperty() @IsString() @MaxLength(80) state!: string;
  @ApiPropertyOptional({ example: '29' }) @IsOptional() @Matches(/^\d{2}$/) stateCode?: string;
  @ApiProperty() @Matches(/^\d{6}$/) pincode!: string;
  @ApiProperty() @IsLatitude() lat!: number;
  @ApiProperty() @IsLongitude() lng!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPureVeg?: boolean;
  @ApiPropertyOptional({ example: 400 }) @IsOptional() @IsNumber() @Min(0) costForTwo?: number;
  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  avgPrepTimeMins?: number;
  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(25)
  deliveryRadiusKm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minOrderValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) packagingCharge?: number;
  @ApiPropertyOptional({ type: [OpeningWindowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningWindowDto)
  openingHours?: OpeningWindowDto[];
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{14}$/) fssaiNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gstin?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) coverImageUrl?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  images?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acceptsDelivery?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acceptsTakeaway?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acceptsDineIn?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acceptsQrOrders?: boolean;
  @ApiPropertyOptional({ type: [String], example: ['MAIN', 'TANDOOR', 'BAR'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  kdsStations?: string[];
}

export class UpdateOutletDto extends PartialType(CreateOutletDto) {}

export class OutletAvailabilityDto {
  @ApiProperty({ description: 'Accepting orders right now' }) @IsBoolean() isOpen!: boolean;
}

export class OutletLocationDto {
  @ApiProperty() @IsLatitude() lat!: number;
  @ApiProperty() @IsLongitude() lng!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) addressLine1?: string;
}

export const DISCOVERY_SORTS = [
  'relevance',
  'rating',
  'distance',
  'eta',
  'cost_low',
  'cost_high',
] as const;

export class NearbyQueryDto extends PageQueryDto {
  @ApiProperty() @Type(() => Number) @IsLatitude() lat!: number;
  @ApiProperty() @Type(() => Number) @IsLongitude() lng!: number;
  @ApiPropertyOptional({ default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(30)
  radiusKm?: number;
  @ApiPropertyOptional({ enum: OUTLET_TYPES }) @IsOptional() @IsIn(OUTLET_TYPES) type?: OutletType;
  @ApiPropertyOptional() @IsOptional() @ToBoolean() @IsBoolean() veg?: boolean;
  @ApiPropertyOptional({ description: 'Comma separated cuisines' })
  @IsOptional()
  @ToArray()
  @IsArray()
  cuisines?: string[];
  @ApiPropertyOptional() @IsOptional() @ToBoolean() @IsBoolean() openNow?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() minRating?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() maxCostForTwo?: number;
  @ApiPropertyOptional({ enum: DISCOVERY_SORTS })
  @IsOptional()
  @IsIn(DISCOVERY_SORTS)
  sort?: (typeof DISCOVERY_SORTS)[number];
}
