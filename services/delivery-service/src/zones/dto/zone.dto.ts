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
  @ApiPropertyOptional({
    example: 1,
    description: 'Floor for the live surge, which raises rider pay (fees: /admin/delivery-pricing)',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  surgeMultiplier?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateDeliveryZoneDto extends PartialType(DeliveryZoneDto) {}
