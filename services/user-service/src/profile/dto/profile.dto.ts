import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) avatarUrl?: string;
  @ApiPropertyOptional({ description: '{ "veg": true, "cuisines": ["South Indian"], "spiceLevel": 2 }' })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;
}

export class AddressDto {
  @ApiProperty({ example: 'Home' }) @IsString() @MaxLength(40) label!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) contactPhone?: string;
  @ApiProperty({ example: '221B, 4th Cross, Indiranagar' }) @IsString() @MaxLength(200) line1!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) landmark?: string;
  @ApiProperty({ example: 'Bengaluru' }) @IsString() @MaxLength(80) city!: string;
  @ApiProperty({ example: 'Karnataka' }) @IsString() @MaxLength(80) state!: string;
  @ApiProperty({ example: '560038' }) @Matches(/^\d{6}$/) pincode!: string;
  @ApiProperty({ example: 12.9719 }) @IsLatitude() lat!: number;
  @ApiProperty({ example: 77.6412 }) @IsLongitude() lng!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(AddressDto) {}
