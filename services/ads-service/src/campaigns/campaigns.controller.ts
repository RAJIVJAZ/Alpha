import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, OptionalUser, Public, RequirePermissions, RequireTenant, TenantId } from '@foodgrid/auth/nest';
import type { CampaignStatus } from '@foodgrid/database';
import type { AccessTokenClaims } from '@foodgrid/types';
import { ServingService } from '../serving/serving.service';
import { CampaignsService } from './campaigns.service';
import { CampaignDto, ClickDto, UpdateCampaignDto } from './dto/campaign.dto';

@ApiTags('ads')
@ApiBearerAuth()
@RequireTenant()
@RequirePermissions(Permissions.AdsManage)
@Controller('ads/campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.campaigns.list(tenantId);
  }
  @Post()
  @ApiOperation({ summary: 'Create a sponsored listing campaign (draft)' })
  create(@CurrentUser() user: AccessTokenClaims, @Body() dto: CampaignDto) {
    return this.campaigns.create(user, dto);
  }
  @Patch(':id')
  update(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(user, id, dto);
  }
  @Post(':id/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.campaigns.submit(user, id);
  }
  @Post(':id/pause')
  @HttpCode(200)
  pause(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.campaigns.setStatus(user, id, 'PAUSED');
  }
  @Post(':id/resume')
  @HttpCode(200)
  resume(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.campaigns.setStatus(user, id, 'ACTIVE');
  }
  @Get(':id/stats')
  @ApiOperation({ summary: 'Impressions, clicks, CTR, CPC, conversions, ROAS' })
  stats(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.stats(tenantId, id);
  }
}

@ApiTags('ads')
@Controller('ads')
export class AdsPublicController {
  constructor(
    private readonly serving: ServingService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Public()
  @Post('events/click')
  @HttpCode(200)
  click(@Body() dto: ClickDto, @OptionalUser() user?: AccessTokenClaims) {
    return this.serving.click(dto, user?.sub);
  }

  @ApiBearerAuth()
  @RequirePermissions(Permissions.PlatformContent)
  @Get('admin/campaigns')
  adminList(@Query('status') status?: CampaignStatus) {
    return this.campaigns.adminList(status);
  }
}
