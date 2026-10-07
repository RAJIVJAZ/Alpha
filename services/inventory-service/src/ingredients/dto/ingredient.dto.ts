import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { INGREDIENT_CATEGORIES, IngredientCategory, STOCK_UNITS, StockUnit } from '@foodgrid/types';
import { PageQueryDto } from '@foodgrid/utils/server';

export class IngredientDto {
  @ApiProperty() @IsString() outletId!: string;
  @ApiProperty({ example: 'Maida (refined flour)' }) @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ example: 'FLR-MAIDA' }) @IsString() @MaxLength(40) sku!: string;
  @ApiProperty({ enum: INGREDIENT_CATEGORIES })
  @IsIn(INGREDIENT_CATEGORIES)
  category!: IngredientCategory;
  @ApiProperty({ enum: STOCK_UNITS }) @IsIn(STOCK_UNITS) unit!: StockUnit;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) reorderLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) reorderQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) safetyStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) shelfLifeDays?: number;
  @ApiPropertyOptional({ enum: ['DRY', 'CHILLED', 'FROZEN'] })
  @IsOptional()
  @IsIn(['DRY', 'CHILLED', 'FROZEN'])
  storageType?: 'DRY' | 'CHILLED' | 'FROZEN';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPerishable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(60) leadTimeDays?: number;
  @ApiPropertyOptional({
    description: 'Marketplace category code for supplier matching (e.g. FLOUR, DAIRY)',
  })
  @IsOptional()
  @IsString()
  marketplaceCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preferredSupplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() marketplaceProductId?: string;
  @ApiPropertyOptional({ description: 'Opening stock (creates an OPENING movement)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) openingUnitCost?: number;
}

export class UpdateIngredientDto extends PartialType(
  OmitType(IngredientDto, ['outletId', 'openingStock', 'openingUnitCost'] as const),
) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListIngredientsDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() outletId?: string;
  @ApiPropertyOptional({ enum: INGREDIENT_CATEGORIES })
  @IsOptional()
  @IsIn(INGREDIENT_CATEGORIES)
  category?: IngredientCategory;
  @ApiPropertyOptional({ enum: ['OK', 'LOW', 'OUT'] })
  @IsOptional()
  @IsIn(['OK', 'LOW', 'OUT'])
  status?: 'OK' | 'LOW' | 'OUT';
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
}
