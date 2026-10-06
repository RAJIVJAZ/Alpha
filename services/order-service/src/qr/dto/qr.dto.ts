import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { OrderLineDto } from '../../pos/dto/pos.dto';

export class TableDto {
  @ApiProperty({ example: 'T4' }) @IsString() @MaxLength(20) label!: string;
  @ApiPropertyOptional({ example: 4 }) @IsOptional() @IsInt() @Min(1) @Max(30) seats?: number;
}

export class QrOrderDto {
  @ApiProperty({ type: [OrderLineDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => OrderLineDto) items!: OrderLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) customerPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) notes?: string;
  @ApiPropertyOptional({ description: 'Pay at the counter instead of online', default: true }) @IsOptional() @IsBoolean() payAtCounter?: boolean;
}
