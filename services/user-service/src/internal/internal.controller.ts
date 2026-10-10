import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Internal } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import { PLATFORM_ROLES, PlatformRole } from '@foodgrid/types';
import { notFound } from '@foodgrid/utils';
import { IdsDto } from '@foodgrid/utils/server';
import { ApprovalsService } from '../approvals/approvals.service';
import { CreateApprovalDto } from '../approvals/dto/approval.dto';
import { AuditService } from '../common/audit.service';

class AddRolesDto {
  @ApiProperty({ enum: PLATFORM_ROLES, isArray: true })
  @IsArray()
  @IsIn(PLATFORM_ROLES, { each: true })
  roles!: PlatformRole[];
}

/** An admin action taken in another service (e.g. a commission rule change). */
class AuditEntryDto {
  @ApiProperty() @IsString() @MaxLength(64) actorId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) tenantId?: string;
  @ApiProperty({ example: 'commission_rule.update' }) @IsString() @MaxLength(80) action!: string;
  @ApiProperty({ example: 'CommissionRule' }) @IsString() @MaxLength(80) entityType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() changes?: Record<string, unknown>;
}

const BASIC = {
  id: true,
  name: true,
  phone: true,
  email: true,
  roles: true,
  status: true,
  createdAt: true,
} as const;

/** Service-to-service API (blocked at the gateway). */
@ApiTags('internal')
@Internal()
@Controller('internal')
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
  ) {}

  @Get('users/:id')
  async user(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: BASIC });
    if (!user) throw notFound('User', id);
    return user;
  }

  @Post('users/batch')
  usersBatch(@Body() dto: IdsDto) {
    return this.prisma.user.findMany({ where: { id: { in: dto.ids } }, select: BASIC });
  }

  @Post('users/:id/roles')
  @ApiOperation({ summary: 'Grant platform roles (idempotent)' })
  async addRoles(@Param('id') id: string, @Body() dto: AddRolesDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    const roles = [...new Set([...user.roles, ...dto.roles])];
    return this.prisma.user.update({
      where: { id },
      data: { roles: { set: roles } },
      select: BASIC,
    });
  }

  @Get('tenants/:id')
  async tenant(@Param('id') id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw notFound('Tenant', id);
    return tenant;
  }

  @Post('tenants/batch')
  @ApiOperation({ summary: 'Tenant names for read models (analytics)' })
  tenantsBatch(@Body() dto: IdsDto) {
    return this.prisma.tenant.findMany({
      where: { id: { in: dto.ids } },
      select: { id: true, name: true, type: true, city: true, status: true },
    });
  }

  @Get('tenants/:id/members')
  @ApiOperation({
    summary: 'Active members (optionally filtered by role) — used for notifications',
  })
  members(@Param('id') id: string, @Query('roles') roles?: string) {
    const roleList = roles?.split(',').filter(Boolean);
    return this.prisma.tenantMember.findMany({
      where: {
        tenantId: id,
        status: 'ACTIVE',
        ...(roleList?.length ? { role: { in: roleList as never[] } } : {}),
      },
      select: { userId: true, role: true, outletIds: true },
    });
  }

  @Post('approvals')
  @ApiOperation({ summary: 'Submit an entity to the admin approval queue' })
  createApproval(@Body() dto: CreateApprovalDto) {
    return this.approvals.create(dto);
  }

  @Post('audit-logs')
  @ApiOperation({ summary: "Record another service's admin action in the audit log" })
  async recordAudit(@Body() dto: AuditEntryDto) {
    const { id } = await this.audit.record(dto);
    return { id };
  }
}
