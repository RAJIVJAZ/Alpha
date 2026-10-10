import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class CompleteDeliveryDto {
  @ApiProperty({ description: '4-digit OTP shown in the customer app (always required)' })
  // presence is checked in the service so the rider gets OTP_REQUIRED, not a validation dump
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'The delivery code has 4 digits' })
  otp?: string;
  @ApiPropertyOptional({
    description: 'Optional handover photo: a delivery-proof upload from POST /media/presign',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  proofPhotoUrl?: string;
  @ApiPropertyOptional({ description: 'Optional signature image, uploaded like the photo' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  proofSignatureUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
  @ApiPropertyOptional({ description: 'Cash collected for COD orders' })
  @IsOptional()
  @IsBoolean()
  codCollected?: boolean;
}

export class FailDeliveryDto {
  @ApiProperty({ example: 'Customer unreachable' }) @IsString() @MaxLength(300) reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) proofPhotoUrl?: string;
}

export class RejectOfferDto {
  @ApiPropertyOptional({ example: 'Too far' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
