import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddCartItemDto {
  @ApiProperty() @IsString() menuItemId!: string;
  @ApiProperty({ minimum: 1, maximum: 50 }) @IsInt() @Min(1) @Max(50) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  addonIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) notes?: string;
  @ApiPropertyOptional({ description: 'Replace a cart from a different outlet' })
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}

export class UpdateCartLineDto {
  @ApiProperty({ minimum: 0, maximum: 50, description: '0 removes the line' })
  @IsInt()
  @Min(0)
  @Max(50)
  quantity!: number;
}

export class ApplyCouponDto {
  @ApiProperty({ example: 'WELCOME50' }) @IsString() @MaxLength(30) code!: string;
}
