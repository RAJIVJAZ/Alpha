import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions, permissionsFor } from '@foodgrid/auth';
import type { AccessTokenClaims } from '@foodgrid/types';
import {
  AllowRejectedTenant,
  CurrentUser,
  RequirePermissions,
  RequireTenant,
  TenantId,
} from '@foodgrid/auth/nest';
import {
  CreateTenantDto,
  InviteMemberDto,
  SubmitKycDto,
  UpdateMemberDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { TenantsService } from './tenants.service';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  @ApiOperation({
    summary: 'Onboard a new business (restaurant, food cart, supplier, wholesaler, retailer)',
  })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateTenantDto) {
    return this.tenants.create(userId, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Businesses I belong to' })
  mine(@CurrentUser('sub') userId: string) {
    return this.tenants.mine(userId);
  }

  @Get('invites')
  @ApiOperation({ summary: 'Staff invitations waiting for me' })
  invites(@CurrentUser('sub') userId: string) {
    return this.tenants.invites(userId);
  }

  @Post('invites/:memberId/accept')
  @ApiOperation({ summary: 'Accept a staff invitation' })
  acceptInvite(@CurrentUser('sub') userId: string, @Param('memberId') memberId: string) {
    return this.tenants.acceptInvite(userId, memberId);
  }

  @RequireTenant()
  @AllowRejectedTenant()
  @Get('current')
  @ApiOperation({ summary: 'My business (PAN and KYC only for settings / finance)' })
  current(@TenantId() tenantId: string, @CurrentUser() user: AccessTokenClaims) {
    const perms = permissionsFor(user);
    return perms.has(Permissions.SettingsManage) || perms.has(Permissions.FinanceRead)
      ? this.tenants.get(tenantId)
      : this.tenants.getPublic(tenantId);
  }

  @RequireTenant()
  @RequirePermissions(Permissions.SettingsManage)
  @Patch('current')
  update(
    @TenantId() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenants.update(tenantId, userId, dto);
  }

  @RequireTenant()
  @AllowRejectedTenant()
  @RequirePermissions(Permissions.SettingsManage)
  @Post('current/kyc')
  @ApiOperation({
    summary: 'Submit / resubmit KYC documents and identifier changes (GSTIN, PAN …) for approval',
  })
  kyc(@TenantId() tenantId: string, @CurrentUser('sub') userId: string, @Body() dto: SubmitKycDto) {
    return this.tenants.submitKyc(tenantId, userId, dto);
  }

  @RequireTenant()
  @RequirePermissions(Permissions.StaffManage)
  @Get('current/members')
  @ApiOperation({ summary: 'Staff management: list members' })
  members(@TenantId() tenantId: string, @CurrentUser('sub') userId: string) {
    return this.tenants.members(tenantId, userId);
  }

  @RequireTenant()
  @RequirePermissions(Permissions.StaffManage)
  @Post('current/members')
  @ApiOperation({ summary: 'Staff management: invite a staff member by phone' })
  invite(
    @TenantId() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.tenants.invite(tenantId, userId, dto);
  }

  @RequireTenant()
  @RequirePermissions(Permissions.StaffManage)
  @Patch('current/members/:memberId')
  updateMember(
    @TenantId() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.tenants.updateMember(tenantId, memberId, userId, dto);
  }
}
