import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
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
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BUYER_SEGMENTS, BuyerSegment, STOCK_UNITS, StockUnit } from '@foodgrid/types';
import { PageQueryDto, ToBoolean } from '@foodgrid/utils/server';

export class ProductDto {
  @ApiProperty({ example: 'FLOUR', description: 'Marketplace category code' })
  @IsString()
  categoryCode!: string;
  @ApiProperty({ example: 'Chakki Fresh Atta' }) @IsString() @MaxLength(160) name!: string;
  @ApiProperty({ example: 'ATTA-25' }) @IsString() @MaxLength(40) sku!: string;
  @ApiPropertyOptional({ example: 'Aashirvaad' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_tld: false }, { each: true })
  images?: string[];
  @ApiProperty({ enum: STOCK_UNITS, example: 'KG' }) @IsIn(STOCK_UNITS) unit!: StockUnit;
  @ApiPropertyOptional({ example: 25, description: 'Units per pack' })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  packSize?: number;
  @ApiProperty({ example: 1150, description: 'Price per pack, pre-tax' })
  @IsNumber()
  @Min(0)
  price!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) mrp?: number;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @IsNumber() @Min(0.001) moq?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.001) maxOrderQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.001) stepQty?: number;
  @ApiProperty({ example: 0 }) @IsNumber() @Min(0) @Max(28) gstRate!: number;
  @ApiPropertyOptional({ example: '11010000' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  hsnCode?: string;
  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  deliveryTimeHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) stockQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) lowStockThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() attributes?: Record<string, unknown>;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
export class UpdateProductDto extends PartialType(OmitType(ProductDto, ['sku'] as const)) {}

export class BulkProductsDto {
  @ApiProperty({ type: [ProductDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ProductDto)
  products!: ProductDto[];
}

export class StockUpdateDto {
  @ApiProperty() @IsNumber() @Min(0) stockQty!: number;
}

export class PriceTierDto {
  @ApiProperty({ example: 10 }) @IsNumber() @Min(0.001) minQty!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxQty?: number;
  @ApiProperty({ example: 1100 }) @IsNumber() @Min(0) unitPrice!: number;
  @ApiPropertyOptional({ enum: BUYER_SEGMENTS })
  @IsOptional()
  @IsIn(BUYER_SEGMENTS)
  segment?: BuyerSegment;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validTo?: string;
}
export class PriceTiersDto {
  @ApiProperty({ type: [PriceTierDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PriceTierDto)
  tiers!: PriceTierDto[];
}

export class CategoryDto {
  @ApiProperty({ example: 'BAKERY', description: 'Stable code products and filters use' })
  @Matches(/^[A-Z][A-Z0-9_]{1,29}$/, { message: 'code must be 2-30 capitals, digits or _' })
  code!: string;
  @ApiProperty({ example: 'Bakery Supplies' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) imageUrl?: string;
}
export class UpdateCategoryDto extends PartialType(OmitType(CategoryDto, ['code'] as const)) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CatalogQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ example: 'DAIRY' }) @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional({ enum: ['SUPPLIER', 'WHOLESALER', 'RETAILER'] })
  @IsOptional()
  @IsIn(['SUPPLIER', 'WHOLESALER', 'RETAILER'])
  sellerType?: 'SUPPLIER' | 'WHOLESALER' | 'RETAILER';
  @ApiPropertyOptional() @IsOptional() @IsString() sellerId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() minPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() maxPrice?: number;
  @ApiPropertyOptional() @IsOptional() @ToBoolean() @IsBoolean() inStock?: boolean;
  @ApiPropertyOptional({ enum: ['relevance', 'price_asc', 'price_desc', 'rating', 'fastest'] })
  @IsOptional()
  @IsIn(['relevance', 'price_asc', 'price_desc', 'rating', 'fastest'])
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'fastest';
}
