import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SeriesPointDto {
  @ApiProperty() @IsDateString() date!: string;
  @ApiProperty() @IsNumber() value!: number;
}

export class DemandForecastDto {
  @ApiProperty({ type: [SeriesPointDto] }) @IsArray() @ArrayMaxSize(1100) @ValidateNested({ each: true }) @Type(() => SeriesPointDto) series!: SeriesPointDto[];
  @ApiProperty({ minimum: 1, maximum: 90 }) @IsInt() @Min(1) @Max(90) horizonDays!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional({ description: 'If set, the response includes depletion prediction' }) @IsOptional() @IsNumber() currentStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
}

export class InventoryOptimizeDto {
  @ApiProperty({ type: [Object] }) @IsArray() @ArrayMaxSize(2000) items!: {
    id: string;
    avgDailyDemand: number;
    demandStdDev: number;
    leadTimeDays: number;
    unitCost: number;
    currentStock: number;
    shelfLifeDays?: number | null;
  }[];
  @ApiPropertyOptional({ default: 0.95 }) @IsOptional() @IsNumber() @Min(0.5) @Max(0.999) serviceLevel?: number;
  @ApiPropertyOptional({ default: 7 }) @IsOptional() @IsInt() @Min(1) reviewPeriodDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
}

export class RankSuppliersDto {
  @ApiProperty({ type: [Object] }) @IsArray() @ArrayMaxSize(500) offers!: import('../engines/supplier-ranking').SupplierOffer[];
  @ApiProperty() @IsNumber() @Min(0.001) quantity!: number;
  @ApiProperty({ enum: ['LOWEST_COST', 'FASTEST', 'BEST_RATED', 'BALANCED'] })
  @IsIn(['LOWEST_COST', 'FASTEST', 'BEST_RATED', 'BALANCED'])
  strategy!: 'LOWEST_COST' | 'FASTEST' | 'BEST_RATED' | 'BALANCED';
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
}

export class SurgeDto {
  @ApiProperty() @IsInt() @Min(0) pendingOrders!: number;
  @ApiProperty() @IsInt() @Min(0) onlineRiders!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() rainMm?: number;
  @ApiProperty() @IsInt() @Min(0) @Max(23) hourOfDay!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFestival?: boolean;
}

export class MarkdownDto {
  @ApiProperty({ type: [Object] }) @IsArray() @ArrayMaxSize(2000) products!: import('../engines/dynamic-pricing').MarkdownInput[];
}

export class FraudScoreDto {
  @ApiProperty({ enum: ['ORDER', 'PAYMENT', 'USER', 'RIDER', 'COUPON_REDEMPTION', 'REFUND'] })
  @IsIn(['ORDER', 'PAYMENT', 'USER', 'RIDER', 'COUPON_REDEMPTION', 'REFUND'])
  entityType!: 'ORDER' | 'PAYMENT' | 'USER' | 'RIDER' | 'COUPON_REDEMPTION' | 'REFUND';
  @ApiProperty() @IsString() entityId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiProperty() @IsObject() features!: import('../engines/fraud').OrderRiskFeatures;
}

export class TrajectoryDto {
  @ApiProperty() @IsString() riderId!: string;
  @ApiProperty() @IsString() deliveryId!: string;
  @ApiProperty({ type: [Object] }) @IsArray() @ArrayMaxSize(5000) pings!: import('../engines/fraud').Ping[];
  @ApiPropertyOptional() @IsOptional() @IsObject() drop?: { lat: number; lng: number };
}

export class ReviewFraudDto {
  @ApiProperty({ enum: ['CONFIRMED_FRAUD', 'FALSE_POSITIVE'] }) @IsIn(['CONFIRMED_FRAUD', 'FALSE_POSITIVE']) outcome!: 'CONFIRMED_FRAUD' | 'FALSE_POSITIVE';
}

export class RouteDto {
  @ApiProperty() @IsObject() start!: { lat: number; lng: number };
  @ApiProperty({ type: [Object] }) @IsArray() @ArrayMaxSize(30) stops!: import('../engines/routing').Stop[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() avgSpeedKmph?: number;
}

export class OutletRecoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiProperty({ type: [Object] }) @IsArray() @ArrayMaxSize(500) history!: import('../engines/recommendations').HistoryOrder[];
  @ApiProperty({ type: [Object] }) @IsArray() @ArrayMaxSize(3000) candidates!: import('../engines/recommendations').CandidateOutlet[];
  @ApiPropertyOptional() @IsOptional() @IsObject() context?: Record<string, unknown>;
}

export class ItemRecoDto {
  @ApiProperty({ type: 'array', items: { type: 'array', items: { type: 'string' } } }) @IsArray() @ArrayMaxSize(5000) baskets!: string[][];
  @ApiProperty({ type: [String] }) @IsArray() seedItemIds!: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) limit?: number;
}

export class OutletScoreDto {
  @ApiProperty() @IsString() tenantId!: string;
  @ApiProperty() @IsString() outletId!: string;
  @ApiProperty() @IsDateString() periodStart!: string;
  @ApiProperty() @IsDateString() periodEnd!: string;
  @ApiProperty() @IsObject() metrics!: import('../engines/outlet-scoring').OutletMetrics;
}

export class SignalDto {
  @ApiProperty({ enum: ['FESTIVAL', 'WEATHER', 'EVENT', 'HOLIDAY'] }) @IsIn(['FESTIVAL', 'WEATHER', 'EVENT', 'HOLIDAY']) type!: 'FESTIVAL' | 'WEATHER' | 'EVENT' | 'HOLIDAY';
  @ApiProperty({ example: 'Diwali' }) @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional({ description: 'Null = nationwide' }) @IsOptional() @IsString() city?: string;
  @ApiProperty() @IsDateString() date!: string;
  @ApiProperty({ example: 1.4 }) @IsNumber() @Min(0.1) @Max(5) impact!: number;
  @ApiPropertyOptional({ type: [String], example: ['SUGAR', 'DAIRY', 'FLOUR'] }) @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
}
