import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class ZoneDto {
  @ApiProperty({ example: 'Bengaluru East' }) @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @Matches(/^\d{6}$/, { each: true }) pincodes?: string[];
  @ApiPropertyOptional() @IsOptional() @IsLatitude() centerLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() centerLng?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.5) @Max(500) radiusKm?: number;
  @ApiProperty() @IsNumber() @Min(0) deliveryCharge!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) freeDeliveryAbove?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minOrderValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(720) leadTimeHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateZoneDto extends PartialType(ZoneDto) {}

export class SlotDto {
  @ApiPropertyOptional({ example: 'Morning' }) @IsOptional() @IsString() @MaxLength(40) label?: string;
  @ApiProperty({ minimum: 0, maximum: 6 }) @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @ApiProperty({ example: '07:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @ApiProperty({ example: '10:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @ApiProperty({ example: 20 }) @IsInt() @Min(1) capacity!: number;
  @ApiPropertyOptional({ example: 720 }) @IsOptional() @IsInt() @Min(0) cutoffMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateSlotDto extends PartialType(SlotDto) {}
