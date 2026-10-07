import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { STOCK_MOVEMENT_TYPES, StockMovementType } from '@foodgrid/types';
import { DateRangeQueryDto } from '@foodgrid/utils/server';

export class ReceiveLineDto {
  @ApiProperty() @IsString() ingredientId!: string;
  @ApiProperty() @IsNumber() @Min(0.001) quantity!: number;
  @ApiProperty({ description: 'Cost per stock unit (pre-tax)' })
  @IsNumber()
  @Min(0)
  unitCost!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
}

export class ReceiveStockDto {
  @ApiProperty() @IsString() outletId!: string;
  @ApiProperty({ type: [ReceiveLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines!: ReceiveLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseOrderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierTenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class AdjustStockDto {
  @ApiProperty() @IsString() ingredientId!: string;
  @ApiProperty({ description: 'Physically counted quantity' })
  @IsNumber()
  @Min(0)
  countedQuantity!: number;
  @ApiProperty() @IsString() @MaxLength(200) reason!: string;
}

export class WastageDto {
  @ApiProperty() @IsString() ingredientId!: string;
  @ApiProperty() @IsNumber() @Min(0.001) quantity!: number;
  @ApiProperty({ example: 'Spoiled — fridge failure' }) @IsString() @MaxLength(200) reason!: string;
}

export class MovementsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() ingredientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() outletId?: string;
  @ApiPropertyOptional({ enum: STOCK_MOVEMENT_TYPES })
  @IsOptional()
  @IsIn(STOCK_MOVEMENT_TYPES)
  type?: StockMovementType;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() page?: number;
}
