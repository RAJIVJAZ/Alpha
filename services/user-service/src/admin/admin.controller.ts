import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, Roles } from '@foodgrid/auth/nest';
import { ApprovalsService } from '../approvals/approvals.service';
import { ApprovalDecisionDto, ListApprovalsDto } from '../approvals/dto/approval.dto';
import { AdminService } from './admin.service';
import {
  CreateStaffDto,
  ListAuditDto,
  ListTenantsDto,
  ListUsersDto,
  UpdateTenantAdminDto,
  UpdateUserRolesDto,
  UpdateUserStatusDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly approvals: ApprovalsService,
  ) {}

  @RequirePermissions(Permissions.PlatformUsersRead)
  @Get('stats')
  @ApiOperation({ summary: 'User / tenant / approval counters for the admin home' })
  stats() {
    return this.admin.stats();
  }

  @RequirePermissions(Permissions.PlatformUsersRead)
  @Get('users')
  @ApiOperation({ summary: 'User management: search users' })
  users(@Query() q: ListUsersDto) {
    return this.admin.listUsers(q);
  }

  @RequirePermissions(Permissions.PlatformUsersRead)
  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @RequirePermissions(Permissions.PlatformUsersManage)
  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Block / unblock a user (revokes sessions when blocking)' })
  setStatus(@Param('id') id: string, @CurrentUser('sub') actor: string, @Body() dto: UpdateUserStatusDto) {
    return this.admin.setUserStatus(id, actor, dto);
  }

  @Roles('ADMIN')
  @Patch('users/:id/roles')
  setRoles(@Param('id') id: string, @CurrentUser('sub') actor: string, @Body() dto: UpdateUserRolesDto) {
    return this.admin.setUserRoles(id, actor, dto);
  }

  @Roles('ADMIN')
  @Post('staff')
  @ApiOperation({ summary: 'Create a back-office staff account with password login' })
  createStaff(@CurrentUser('sub') actor: string, @Body() dto: CreateStaffDto) {
    return this.admin.createStaff(actor, dto);
  }

  @RequirePermissions(Permissions.PlatformUsersRead)
  @Get('tenants')
  tenants(@Query() q: ListTenantsDto) {
    return this.admin.listTenants(q);
  }

  @RequirePermissions(Permissions.PlatformUsersRead)
  @Get('tenants/:id')
  tenant(@Param('id') id: string) {
    return this.admin.getTenant(id);
  }

  @RequirePermissions(Permissions.PlatformApprovals)
  @Patch('tenants/:id')
  @ApiOperation({ summary: 'Suspend / reactivate a business or override its commission' })
  updateTenant(@Param('id') id: string, @CurrentUser('sub') actor: string, @Body() dto: UpdateTenantAdminDto) {
    return this.admin.updateTenant(id, actor, dto);
  }

  @RequirePermissions(Permissions.PlatformApprovals)
  @Get('approvals')
  @ApiOperation({ summary: 'Approval queue (restaurants, riders, suppliers, products, ads)' })
  listApprovals(@Query() q: ListApprovalsDto) {
    return this.approvals.list(q);
  }

  @RequirePermissions(Permissions.PlatformApprovals)
  @Get('approvals/:id')
  approval(@Param('id') id: string) {
    return this.approvals.get(id);
  }

  @RequirePermissions(Permissions.PlatformApprovals)
  @Post('approvals/:id/decision')
  @ApiOperation({ summary: 'Approve / reject / request changes' })
  decide(@Param('id') id: string, @CurrentUser('sub') actor: string, @Body() dto: ApprovalDecisionDto) {
    return this.approvals.decide(id, dto, actor);
  }

  @RequirePermissions(Permissions.PlatformUsersRead)
  @Get('audit-logs')
  audit(@Query() q: ListAuditDto) {
    return this.admin.auditLogs(q);
  }
}
