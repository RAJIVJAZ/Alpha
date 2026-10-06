import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { VEHICLE_TYPES, VehicleType } from '@foodgrid/types';
import { PageQueryDto } from '@foodgrid/utils/server';

export class RiderDocumentDto {
  @ApiProperty({ example: 'DRIVING_LICENSE' }) @IsString() @MaxLength(40) kind!: string;
  @ApiProperty() @IsString() url!: string;
}

export class RiderOnboardingDto {
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiProperty({ example: 'Bengaluru' }) @IsString() @MaxLength(60) city!: string;
  @ApiProperty({ enum: VEHICLE_TYPES }) @IsIn(VEHICLE_TYPES) vehicleType!: VehicleType;
  @ApiPropertyOptional({ example: 'KA01AB1234' }) @IsOptional() @Matches(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/) vehicleNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) licenseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}$/) aadhaarLast4?: string;
  @ApiPropertyOptional({ example: 'rider@okaxis' }) @IsOptional() @Matches(/^[\w.-]+@[\w]+$/) upiId?: string;
  @ApiPropertyOptional({ type: [RiderDocumentDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RiderDocumentDto) documents?: RiderDocumentDto[];
}

export class LocationPingDto {
  @ApiProperty() @IsLatitude() lat!: number;
  @ApiProperty() @IsLongitude() lng!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) accuracyM?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) speedKmph?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(360) heading?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) batteryPct?: number;
}

export class ListRidersDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'OFFBOARDED'] }) @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() online?: string;
}

export class AdminRiderStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'OFFBOARDED'] }) @IsIn(['ACTIVE', 'SUSPENDED', 'OFFBOARDED']) status!: 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
}
