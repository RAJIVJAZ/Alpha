import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEmail, IsIn, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { PLATFORM_ROLES, PlatformRole, TENANT_STATUSES, TENANT_TYPES } from '@foodgrid/types';
import { PageQueryDto } from '@foodgrid/utils/server';

export class ListUsersDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Search by name, phone or email' }) @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ enum: PLATFORM_ROLES }) @IsOptional() @IsIn(PLATFORM_ROLES) role?: PlatformRole;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'BLOCKED', 'DELETED'] }) @IsOptional() @IsIn(['ACTIVE', 'BLOCKED', 'DELETED']) status?: 'ACTIVE' | 'BLOCKED' | 'DELETED';
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'BLOCKED'] }) @IsIn(['ACTIVE', 'BLOCKED']) status!: 'ACTIVE' | 'BLOCKED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class UpdateUserRolesDto {
  @ApiProperty({ enum: PLATFORM_ROLES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(PLATFORM_ROLES, { each: true })
  roles!: PlatformRole[];
}

export class CreateStaffDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ minLength: 10 }) @IsString() @Length(10, 128) password!: string;
  @ApiProperty({ enum: ['ADMIN', 'SUPPORT', 'FINANCE', 'OPS'], isArray: true })
  @IsArray()
  @IsIn(['ADMIN', 'SUPPORT', 'FINANCE', 'OPS'], { each: true })
  roles!: PlatformRole[];
}

export class ListTenantsDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ enum: TENANT_TYPES }) @IsOptional() @IsIn(TENANT_TYPES) type?: (typeof TENANT_TYPES)[number];
  @ApiPropertyOptional({ enum: TENANT_STATUSES }) @IsOptional() @IsIn(TENANT_STATUSES) status?: (typeof TENANT_STATUSES)[number];
}

export class UpdateTenantAdminDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED'] }) @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
  @ApiPropertyOptional({ description: 'Commission override in percent' }) @IsOptional() @IsNumber() @Min(0) @Max(50) commissionRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ListAuditDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actorId?: string;
}
