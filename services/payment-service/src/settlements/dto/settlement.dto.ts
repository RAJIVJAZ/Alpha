import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { TENANT_TYPES, TenantType } from '@foodgrid/types';
import { PageQueryDto } from '@foodgrid/utils/server';

export class CommissionRuleDto {
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional({ enum: TENANT_TYPES }) @IsOptional() @IsIn(TENANT_TYPES) tenantType?: TenantType;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() outletId?: string;
  @ApiProperty({ example: 18 }) @IsNumber() @Min(0) @Max(60) ratePct!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) fixedFee?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minFee?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxFee?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCommissionRuleDto extends PartialType(CommissionRuleDto) {}

export class RunSettlementDto {
  @ApiProperty({ example: '2026-09-28' }) @IsDateString() periodStart!: string;
  @ApiProperty({ example: '2026-10-05', description: 'Exclusive' }) @IsDateString() periodEnd!: string;
}

export class ListSettlementsDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional({ enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'ON_HOLD'] })
  @IsOptional() @IsIn(['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'ON_HOLD'])
  status?: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'ON_HOLD';
}

export class MarkSettlementPaidDto {
  @ApiProperty() @IsString() @MaxLength(60) payoutReference!: string;
}
