import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class CompleteDeliveryDto {
  @ApiPropertyOptional({ description: '4-digit OTP shown in the customer app' }) @IsOptional() @Matches(/^\d{4}$/) otp?: string;
  @ApiPropertyOptional({ description: 'Proof photo (required for contact-less drops without OTP)' }) @IsOptional() @IsUrl({ require_tld: false }) proofPhotoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) proofSignatureUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
  @ApiPropertyOptional({ description: 'Cash collected for COD orders' }) @IsOptional() @IsBoolean() codCollected?: boolean;
}

export class FailDeliveryDto {
  @ApiProperty({ example: 'Customer unreachable' }) @IsString() @MaxLength(300) reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) proofPhotoUrl?: string;
}

export class RejectOfferDto {
  @ApiPropertyOptional({ example: 'Too far' }) @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
