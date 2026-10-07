import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { APP_KINDS, AppKind, NOTIFICATION_CHANNELS, NotificationChannel } from '@foodgrid/types';
import { PageQueryDto } from '@foodgrid/utils/server';

/** Keeps the inbox's 30-per-page default so clients that only send `page` see the same list. */
export class InboxQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  override pageSize?: number = 30;
}

export class RegisterDeviceDto {
  @ApiProperty() @IsString() @MaxLength(4096) token!: string;
  @ApiProperty({ enum: ['ANDROID', 'IOS', 'WEB'] }) @IsIn(['ANDROID', 'IOS', 'WEB']) platform!:
    'ANDROID' | 'IOS' | 'WEB';
  @ApiProperty({ enum: APP_KINDS }) @IsIn(APP_KINDS) app!: AppKind;
}

export class PreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() smsEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketingEnabled?: boolean;
  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursStart?: string;
  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursEnd?: string;
}

export class InternalSendDto {
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipient?: string;
  @ApiProperty({ enum: NOTIFICATION_CHANNELS })
  @IsIn(NOTIFICATION_CHANNELS)
  channel!: NotificationChannel;
  @ApiPropertyOptional({ enum: APP_KINDS }) @IsOptional() @IsIn(APP_KINDS) app?: AppKind;
  @ApiPropertyOptional() @IsOptional() @IsString() templateKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() data?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
}

export class InternalSmsDto {
  @ApiProperty() @IsString() phone!: string;
  @ApiProperty() @IsString() templateKey!: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() data?: Record<string, unknown>;
}

export class TemplateDto {
  @ApiProperty({ example: 'order.accepted' }) @IsString() key!: string;
  @ApiProperty({ enum: NOTIFICATION_CHANNELS })
  @IsIn(NOTIFICATION_CHANNELS)
  channel!: NotificationChannel;
  @ApiPropertyOptional({ default: 'en' }) @IsOptional() @IsString() locale?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiProperty() @IsString() body!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
