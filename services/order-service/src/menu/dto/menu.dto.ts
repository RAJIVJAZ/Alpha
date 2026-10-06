import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CategoryDto {
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCategoryDto extends PartialType(CategoryDto) {}

export class VariantDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty({ example: 'Full' }) @IsString() @MaxLength(60) name!: string;
  @ApiProperty({ example: 80 }) @IsNumber() priceDelta!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAvailable?: boolean;
}

export class AddonDto {
  @ApiProperty({ example: 'Extra cheese' }) @IsString() @MaxLength(60) name!: string;
  @ApiProperty({ example: 30 }) @IsNumber() @Min(0) price!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isVeg?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAvailable?: boolean;
}

export class AddonGroupDto {
  @ApiProperty({ example: 'Add-ons' }) @IsString() @MaxLength(60) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) minSelect?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxSelect?: number;
  @ApiProperty({ type: [AddonDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => AddonDto) addons!: AddonDto[];
}

export class MenuItemDto {
  @ApiProperty() @IsString() categoryId!: string;
  @ApiProperty({ example: 'Hyderabadi Chicken Biryani' }) @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(600) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) sku?: string;
  @ApiProperty({ example: 289 }) @IsNumber() @Min(0) price!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) compareAtPrice?: number;
  @ApiProperty() @IsBoolean() isVeg!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAvailable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRecommended?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) prepTimeMins?: number;
  @ApiPropertyOptional({ example: 5 }) @IsOptional() @IsNumber() @Min(0) @Max(28) gstRate?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(5) spiceLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() calories?: number;
  @ApiPropertyOptional({ example: 'TANDOOR' }) @IsOptional() @IsString() kdsStation?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional({ type: [VariantDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => VariantDto) variants?: VariantDto[];
  @ApiPropertyOptional({ type: [AddonGroupDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AddonGroupDto) addonGroups?: AddonGroupDto[];
}
export class UpdateMenuItemDto extends PartialType(MenuItemDto) {}

export class BulkAvailabilityDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) itemIds!: string[];
  @ApiProperty() @IsBoolean() isAvailable!: boolean;
}
