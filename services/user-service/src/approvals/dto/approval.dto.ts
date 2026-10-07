import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '@foodgrid/utils/server';

export const APPROVAL_ENTITY_TYPES = [
  'TENANT',
  'OUTLET',
  'RIDER',
  'PRODUCT',
  'AD_CAMPAIGN',
] as const;
export type ApprovalEntity = (typeof APPROVAL_ENTITY_TYPES)[number];

export class CreateApprovalDto {
  @ApiProperty({ enum: APPROVAL_ENTITY_TYPES })
  @IsIn(APPROVAL_ENTITY_TYPES)
  entityType!: ApprovalEntity;
  @ApiProperty() @IsString() entityId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() submittedBy?: string;
  @ApiPropertyOptional({ type: [Object] }) @IsOptional() @IsArray() documents?: Record<
    string,
    unknown
  >[];
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ApprovalDecisionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'] })
  @IsIn(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'])
  decision!: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ListApprovalsDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: APPROVAL_ENTITY_TYPES })
  @IsOptional()
  @IsIn(APPROVAL_ENTITY_TYPES)
  entityType?: ApprovalEntity;
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
}
