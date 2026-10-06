import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { PURCHASE_ORDER_STATUSES, PurchaseOrderStatus, SUPPLIER_STRATEGIES, SupplierStrategy } from '@foodgrid/types';
import { PageQueryDto, ToArray } from '@foodgrid/utils/server';

export class PoLineDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiPropertyOptional({ description: 'Ingredient this product restocks' }) @IsOptional() @IsString() ingredientId?: string;
  @ApiProperty({ description: 'Packs to order' }) @IsNumber() @Min(0.001) quantity!: number;
}

export class CreatePoDto {
  @ApiProperty() @IsString() outletId!: string;
  @ApiProperty() @IsString() supplierTenantId!: string;
  @ApiProperty({ type: [PoLineDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PoLineDto) items!: PoLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @ApiPropertyOptional({ enum: ['PREPAID', 'COD', 'NET_7', 'NET_15', 'NET_30'] }) @IsOptional() @IsIn(['PREPAID', 'COD', 'NET_7', 'NET_15', 'NET_30']) paymentTerms?: string;
}

export class AutoPoDto {
  @ApiPropertyOptional({ type: [String], description: 'Alerts to act on (default: all open alerts)' }) @IsOptional() @IsArray() @IsString({ each: true }) alertIds?: string[];
  @ApiPropertyOptional({ enum: SUPPLIER_STRATEGIES }) @IsOptional() @IsIn(SUPPLIER_STRATEGIES) strategy?: SupplierStrategy;
}

export class DecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

export class ReceiveLineDto {
  @ApiProperty() @IsString() itemId!: string;
  @ApiProperty({ description: 'Packs received in good condition' }) @IsNumber() @Min(0) receivedQty!: number;
}
export class ReceivePoDto {
  @ApiProperty({ type: [ReceiveLineDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiveLineDto) lines!: ReceiveLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ListPoDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: PURCHASE_ORDER_STATUSES, isArray: true }) @IsOptional() @ToArray() @IsArray() @IsIn(PURCHASE_ORDER_STATUSES, { each: true }) status?: PurchaseOrderStatus[];
  @ApiPropertyOptional() @IsOptional() @IsString() outletId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierTenantId?: string;
}

export class SettingsDto {
  @ApiPropertyOptional() @IsOptional() autoPoEnabled?: boolean;
  @ApiPropertyOptional({ description: 'Auto-generated POs up to this total skip owner approval' }) @IsOptional() @IsNumber() @Min(0) autoApproveBelow?: number;
  @ApiPropertyOptional({ enum: SUPPLIER_STRATEGIES }) @IsOptional() @IsIn(SUPPLIER_STRATEGIES) defaultStrategy?: SupplierStrategy;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(3) forecastHorizonDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.5) serviceLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) reviewPeriodDays?: number;
}
