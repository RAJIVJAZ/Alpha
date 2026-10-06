import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { DEALER_TIERS, DealerTier, PAYMENT_TERMS, PaymentTerms } from '@foodgrid/types';

export class TerritoryDto {
  @ApiProperty({ example: 'North Karnataka' }) @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) code?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) states?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) cities?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @Matches(/^\d{6}$/, { each: true }) pincodes?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() managerUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) monthlyTarget?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateTerritoryDto extends PartialType(TerritoryDto) {}

export class DealerDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) contactName?: string;
  @ApiProperty() @IsString() @MaxLength(20) phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gstin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) address?: string;
  @ApiProperty() @IsString() @MaxLength(80) city!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() territoryId?: string;
  @ApiPropertyOptional({ description: 'Platform tenant id of the dealer (enables dealer pricing)' }) @IsOptional() @IsString() dealerTenantId?: string;
  @ApiPropertyOptional({ enum: DEALER_TIERS }) @IsOptional() @IsIn(DEALER_TIERS) tier?: DealerTier;
  @ApiPropertyOptional({ enum: ['PROSPECT', 'ACTIVE', 'INACTIVE', 'BLOCKED'] }) @IsOptional() @IsIn(['PROSPECT', 'ACTIVE', 'INACTIVE', 'BLOCKED']) status?: 'PROSPECT' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
  @ApiPropertyOptional({ enum: PAYMENT_TERMS }) @IsOptional() @IsIn(PAYMENT_TERMS) paymentTerms?: PaymentTerms;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(50) discountPct?: number;
}
export class UpdateDealerDto extends PartialType(DealerDto) {}
