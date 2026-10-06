import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { STOCK_UNITS, StockUnit } from '@foodgrid/types';

export class RecipeLineDto {
  @ApiProperty() @IsString() ingredientId!: string;
  @ApiProperty({ example: 150 }) @IsNumber() @Min(0.0001) quantity!: number;
  @ApiProperty({ enum: STOCK_UNITS, example: 'G' }) @IsIn(STOCK_UNITS) unit!: StockUnit;
  @ApiPropertyOptional({ example: 5 }) @IsOptional() @IsNumber() @Min(0) @Max(80) wastagePct?: number;
}

export class RecipeDto {
  @ApiProperty() @IsString() outletId!: string;
  @ApiProperty({ description: 'Menu item this recipe produces' }) @IsString() menuItemId!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional({ default: 1, description: 'Portions produced by the quantities below' }) @IsOptional() @IsNumber() @Min(0.01) yieldQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) prepTimeMins?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) instructions?: string;
  @ApiProperty({ type: [RecipeLineDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RecipeLineDto) lines!: RecipeLineDto[];
}
