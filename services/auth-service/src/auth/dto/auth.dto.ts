import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '9876543210', description: '10-digit Indian mobile or E.164 number' })
  @IsString()
  @MaxLength(20)
  phone!: string;
}

export class DeviceInfoDto {
  @ApiPropertyOptional({ description: 'Stable device identifier (used for fraud signals)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class VerifyOtpDto extends DeviceInfoDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  @ApiPropertyOptional({ description: 'Referral code of the inviting user (new sign-ups only)' })
  @IsOptional()
  @IsString()
  @Length(6, 12)
  referralCode?: string;
}

export class GoogleLoginDto extends DeviceInfoDto {
  @ApiProperty({ description: 'Google ID token from Google Identity Services / google_sign_in' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

export class PasswordLoginDto extends DeviceInfoDto {
  @ApiProperty({ example: 'admin@foodgrid.in' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(8, 128)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class SwitchTenantDto {
  @ApiPropertyOptional({
    description: 'Tenant to activate; omit/null to clear the business context',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  tenantId?: string | null;
}

export class RevokeUserSessionsDto {
  @ApiProperty()
  @IsString()
  userId!: string;
}
