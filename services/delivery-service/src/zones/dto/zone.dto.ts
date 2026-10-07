import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class DeliveryZoneDto {
  @ApiProperty({ example: 'Indiranagar' }) @IsString() @MaxLength(80) name!: string;
  @ApiProperty({ example: 'Bengaluru' }) @IsString() @MaxLength(80) city!: string;
  @ApiProperty({
    description: 'GeoJSON polygon ring: [[lng, lat], ...]',
    type: 'array',
    items: { type: 'array', items: { type: 'number' } },
  })
  @IsArray()
  polygon!: [number, number][];
  @ApiProperty() @IsLatitude() centerLat!: number;
  @ApiProperty() @IsLongitude() centerLng!: number;
  @ApiProperty({ example: 25 }) @IsNumber() @Min(0) baseFee!: number;
  @ApiProperty({ example: 8 }) @IsNumber() @Min(0) perKmFee!: number;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @IsNumber() @Min(0) freeKm?: number;
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  surgeMultiplier?: number;
  @ApiProperty({ example: 30 }) @IsNumber() @Min(0) riderBasePay!: number;
  @ApiProperty({ example: 6 }) @IsNumber() @Min(0) riderPerKm!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateDeliveryZoneDto extends PartialType(DeliveryZoneDto) {}
