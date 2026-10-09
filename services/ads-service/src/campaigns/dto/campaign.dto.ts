import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AD_PLACEMENTS, AdPlacement } from '@foodgrid/types';

export class CampaignDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ enum: AD_PLACEMENTS }) @IsIn(AD_PLACEMENTS) placement!: AdPlacement;
  @ApiProperty({ enum: ['OUTLET', 'MENU_ITEM', 'PRODUCT'] })
  @IsIn(['OUTLET', 'MENU_ITEM', 'PRODUCT'])
  targetType!: 'OUTLET' | 'MENU_ITEM' | 'PRODUCT';
  @ApiProperty() @IsString() targetId!: string;
  @ApiPropertyOptional({ enum: ['CPC', 'CPM'] }) @IsOptional() @IsIn(['CPC', 'CPM']) bidType?:
    'CPC' | 'CPM';
  @ApiProperty({ example: 6 }) @IsNumber() @Min(0.5) @Max(500) bidAmount!: number;
  @ApiProperty({ example: 500 }) @IsNumber() @Min(50) dailyBudget!: number;
  @ApiProperty({ example: 10000 }) @IsNumber() @Min(100) totalBudget!: number;
  @ApiPropertyOptional({ type: [String], example: ['biryani', 'hyderabadi'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
  @ApiPropertyOptional({ type: [String], example: ['Bengaluru'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cities?: string[];
  @ApiProperty() @IsDateString() startsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional({
    example: { title: '20% off on biryanis', imageUrl: 'https://…', cta: 'Order now' },
  })
  @IsOptional()
  @IsObject()
  creative?: Record<string, string>;
}
export class UpdateCampaignDto extends PartialType(CampaignDto) {}

export class ServeDto {
  @ApiProperty({ enum: AD_PLACEMENTS }) @IsIn(AD_PLACEMENTS) placement!: AdPlacement;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() keywords?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(10) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sessionId?: string;
}

export class ClickDto {
  @ApiProperty() @IsString() campaignId!: string;
  @ApiPropertyOptional({
    description: 'clickToken of the served ad; clicks without one are not charged',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  clickToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sessionId?: string;
}
