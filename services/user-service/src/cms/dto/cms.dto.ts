import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

const AUDIENCES = ['ALL', 'CUSTOMER', 'MERCHANT', 'RIDER', 'SUPPLIER'] as const;

export class CmsPageDto {
  @ApiProperty({ example: 'terms-of-service' }) @Matches(/^[a-z0-9-]+$/) slug!: string;
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiProperty({ description: 'Markdown body' }) @IsString() body!: string;
  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] }) @IsOptional() @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']) status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  @ApiPropertyOptional({ enum: AUDIENCES }) @IsOptional() @IsIn(AUDIENCES) audience?: (typeof AUDIENCES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) seoTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) seoDescription?: string;
}
export class UpdateCmsPageDto extends PartialType(CmsPageDto) {}

export class CmsBannerDto {
  @ApiProperty() @IsString() @MaxLength(120) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) subtitle?: string;
  @ApiProperty() @IsUrl({ require_tld: false }) imageUrl!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkUrl?: string;
  @ApiProperty({ example: 'HOME_HERO' }) @IsString() @MaxLength(40) placement!: string;
  @ApiPropertyOptional({ enum: AUDIENCES }) @IsOptional() @IsIn(AUDIENCES) audience?: (typeof AUDIENCES)[number];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) cities?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCmsBannerDto extends PartialType(CmsBannerDto) {}

export class BannerQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() placement?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional({ enum: AUDIENCES }) @IsOptional() @IsIn(AUDIENCES) audience?: (typeof AUDIENCES)[number];
}
