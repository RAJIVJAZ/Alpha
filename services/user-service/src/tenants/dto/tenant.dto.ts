import { ApiProperty, ApiPropertyOptional, OmitType, PartialType, PickType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TENANT_ROLES, TenantRole } from '@foodgrid/types';

export const ONBOARDABLE_TYPES = [
  'RESTAURANT',
  'FOOD_CART',
  'SUPPLIER',
  'WHOLESALER',
  'RETAILER',
] as const;

export class KycDocumentDto {
  @ApiProperty({ example: 'FSSAI_LICENSE' }) @IsString() @MaxLength(40) kind!: string;
  @ApiProperty() @IsUrl({ require_tld: false }) url!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) number?: string;
}

export class CreateTenantDto {
  @ApiProperty({ enum: ONBOARDABLE_TYPES })
  @IsIn(ONBOARDABLE_TYPES)
  type!: (typeof ONBOARDABLE_TYPES)[number];
  @ApiProperty({ example: 'Spice Route Kitchens' }) @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @ApiPropertyOptional({ example: '29AABCS1234K1ZC' })
  @IsOptional()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, { message: 'Invalid GSTIN format' })
  gstin?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/) pan?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{14}$/) fssaiLicense?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @ApiProperty() @IsString() @MaxLength(200) addressLine1!: string;
  @ApiProperty() @IsString() @MaxLength(80) city!: string;
  @ApiProperty() @IsString() @MaxLength(80) state!: string;
  @ApiPropertyOptional({ example: '29' }) @IsOptional() @Matches(/^\d{2}$/) stateCode?: string;
  @ApiProperty() @Matches(/^\d{6}$/) pincode!: string;
  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) logoUrl?: string;
  @ApiPropertyOptional({ type: [KycDocumentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => KycDocumentDto)
  kycDocuments?: KycDocumentDto[];
}

/** Identifiers checked during KYC review: they change only through POST current/kyc and approval. */
const KYC_IDENTITY_FIELDS = ['legalName', 'gstin', 'pan', 'fssaiLicense', 'stateCode'] as const;

export class UpdateTenantDto extends PartialType(
  OmitType(CreateTenantDto, ['type', 'kycDocuments', ...KYC_IDENTITY_FIELDS] as const),
) {}

/** Identifier changes in a KYC submission are applied only when the review approves them. */
export class SubmitKycDto extends PartialType(PickType(CreateTenantDto, KYC_IDENTITY_FIELDS)) {
  @ApiProperty({ type: [KycDocumentDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => KycDocumentDto)
  documents!: KycDocumentDto[];
}

export class InviteMemberDto {
  @ApiProperty({ example: '9876500001' }) @IsString() @MaxLength(20) phone!: string;
  @ApiPropertyOptional({ description: 'Ignored: invitees set their own name', deprecated: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
  @ApiProperty({ enum: TENANT_ROLES }) @IsIn(TENANT_ROLES) role!: TenantRole;
  @ApiPropertyOptional({ type: [String], description: 'Restrict to these outlets (empty = all)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outletIds?: string[];
  @ApiPropertyOptional({ example: 'Head Chef' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string;
}

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: TENANT_ROLES }) @IsOptional() @IsIn(TENANT_ROLES) role?: TenantRole;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outletIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) title?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'REVOKED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'REVOKED'])
  status?: 'ACTIVE' | 'REVOKED';
}
