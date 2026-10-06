import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, Internal, RequirePermissions } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import { InternalSendDto, InternalSmsDto, PreferencesDto, RegisterDeviceDto, TemplateDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('devices')
  @ApiOperation({ summary: 'Register an FCM / APNs device token' })
  register(@CurrentUser('sub') userId: string, @Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(userId, dto.token, dto.platform, dto.app);
  }

  @Delete('devices/:token')
  @HttpCode(204)
  async remove(@CurrentUser('sub') userId: string, @Param('token') token: string) {
    await this.notifications.removeDevice(userId, token);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'In-app notification inbox' })
  inbox(@CurrentUser('sub') userId: string, @Query('page') page?: number) {
    return this.notifications.inbox(userId, Number(page) || 1);
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  read(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  readAll(@CurrentUser('sub') userId: string) {
    return this.notifications.markRead(userId);
  }

  @Get('notifications/preferences')
  prefs(@CurrentUser('sub') userId: string) {
    return this.notifications.preferences(userId);
  }

  @Put('notifications/preferences')
  updatePrefs(@CurrentUser('sub') userId: string, @Body() dto: PreferencesDto) {
    return this.notifications.updatePreferences(userId, dto);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@RequirePermissions(Permissions.PlatformNotifications)
@Controller('admin/notification-templates')
export class TemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() list() {
    return this.prisma.notificationTemplate.findMany({ orderBy: [{ key: 'asc' }, { channel: 'asc' }] });
  }

  @Put()
  @ApiOperation({ summary: 'Override a built-in template' })
  upsert(@Body() dto: TemplateDto) {
    const locale = dto.locale ?? 'en';
    return this.prisma.notificationTemplate.upsert({
      where: { key_channel_locale: { key: dto.key, channel: dto.channel, locale } },
      create: { ...dto, locale },
      update: { title: dto.title, body: dto.body, isActive: dto.isActive ?? true },
    });
  }
}

@ApiTags('internal')
@Internal()
@Controller('internal/notifications')
export class InternalNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('send')
  @HttpCode(200)
  send(@Body() dto: InternalSendDto) {
    return this.notifications.send(dto);
  }

  @Post('sms')
  @HttpCode(200)
  @ApiOperation({ summary: 'Transactional SMS (OTP)' })
  async sms(@Body() dto: InternalSmsDto) {
    const [n] = await this.notifications.send({ channel: 'SMS', recipient: dto.phone, templateKey: dto.templateKey, data: dto.data });
    return { status: n?.status ?? 'SKIPPED' };
  }
}
