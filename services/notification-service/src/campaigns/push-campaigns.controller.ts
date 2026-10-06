import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions } from '@foodgrid/auth/nest';
import { PushCampaignDto, PushCampaignsService } from './push-campaigns.service';

@ApiTags('admin')
@ApiBearerAuth()
@RequirePermissions(Permissions.PlatformNotifications)
@Controller('admin/push-campaigns')
export class PushCampaignsController {
  constructor(private readonly campaigns: PushCampaignsService) {}

  @Get() list() {
    return this.campaigns.list();
  }
  @Post()
  @ApiOperation({ summary: 'Create (optionally schedule) a push campaign' })
  create(@CurrentUser('sub') userId: string, @Body() dto: PushCampaignDto) {
    return this.campaigns.create(userId, dto);
  }
  @Post(':id/send')
  @HttpCode(200)
  send(@Param('id') id: string) {
    return this.campaigns.send(id);
  }
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.campaigns.cancel(id);
  }
}
