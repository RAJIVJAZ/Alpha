import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { COUPON_TYPES, CouponType, PAYMENT_METHODS, PaymentMethod } from '@foodgrid/types';

export class CouponDto {
  @ApiProperty({ example: 'TASTY50' }) @Matches(/^[A-Z0-9]{4,20}$/) code!: string;
  @ApiProperty() @IsString() @MaxLength(80) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiProperty({ enum: COUPON_TYPES }) @IsIn(COUPON_TYPES) type!: CouponType;
  @ApiProperty() @IsNumber() @Min(0) value!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxDiscount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minOrderValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) usageLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) perUserLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() firstOrderOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() membersOnly?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) outletIds?: string[];
  @ApiPropertyOptional({ enum: PAYMENT_METHODS, isArray: true }) @IsOptional() @IsArray() @IsIn(PAYMENT_METHODS, { each: true }) paymentMethods?: PaymentMethod[];
  @ApiProperty() @IsDateString() validFrom!: string;
  @ApiProperty() @IsDateString() validTo!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PlatformCouponDto extends CouponDto {
  @ApiPropertyOptional({ enum: ['PLATFORM', 'MERCHANT', 'SHARED'] })
  @IsOptional() @IsIn(['PLATFORM', 'MERCHANT', 'SHARED'])
  fundedBy?: 'PLATFORM' | 'MERCHANT' | 'SHARED';
  @ApiPropertyOptional({ description: 'Restrict to a tenant (restaurant chain)' }) @IsOptional() @IsString() tenantId?: string;
}

export class UpdateCouponDto extends PartialType(CouponDto) {}
