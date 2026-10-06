import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class OrderLineDto {
  @ApiProperty() @IsString() menuItemId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(99) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) addonIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) notes?: string;
}

export class PosOrderDto {
  @ApiProperty() @IsString() outletId!: string;
  @ApiProperty({ type: [OrderLineDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => OrderLineDto) items!: OrderLineDto[];
  @ApiProperty({ enum: ['CASH', 'UPI', 'CARD'] }) @IsIn(['CASH', 'UPI', 'CARD']) paymentMethod!: 'CASH' | 'UPI' | 'CARD';
  @ApiProperty({ enum: ['TAKEAWAY', 'DINE_IN'] }) @IsIn(['TAKEAWAY', 'DINE_IN']) orderType!: 'TAKEAWAY' | 'DINE_IN';
  @ApiPropertyOptional() @IsOptional() @IsString() tableId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) customerPhone?: string;
  @ApiPropertyOptional({ description: 'Manual flat discount (₹)' }) @IsOptional() @IsNumber() @Min(0) discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class PosSummaryQueryDto {
  @ApiProperty() @IsString() outletId!: string;
  @ApiPropertyOptional({ example: '2026-10-06', description: 'Business date (IST); defaults to today' }) @IsOptional() @IsDateString() date?: string;
}
