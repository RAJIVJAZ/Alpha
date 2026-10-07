import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
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

  @RequireTenant()
  @Get('current')
  current(@TenantId() tenantId: string) {
    return this.tenants.get(tenantId);
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
  @RequirePermissions(Permissions.SettingsManage)
  @Post('current/kyc')
  @ApiOperation({ summary: 'Submit / resubmit KYC documents for approval' })
  kyc(@TenantId() tenantId: string, @CurrentUser('sub') userId: string, @Body() dto: SubmitKycDto) {
    return this.tenants.submitKyc(tenantId, userId, dto);
  }

  @RequireTenant()
  @RequirePermissions(Permissions.StaffManage)
  @Get('current/members')
  @ApiOperation({ summary: 'Staff management: list members' })
  members(@TenantId() tenantId: string) {
    return this.tenants.members(tenantId);
  }

  @RequireTenant()
  @RequirePermissions(Permissions.StaffManage)
  @Post('current/members')
  @ApiOperation({ summary: 'Staff management: add a staff member by phone' })
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
