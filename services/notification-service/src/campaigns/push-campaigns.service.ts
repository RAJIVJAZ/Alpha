import { Injectable, Logger } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { PrismaService } from '@foodgrid/database/nest';
import type { AppKind, Prisma } from '@foodgrid/database';
import { APP_KINDS } from '@foodgrid/types';
import { conflict, notFound } from '@foodgrid/utils';
import { NotificationsService } from '../notifications/notifications.service';

export class PushCampaignDto {
  @ApiProperty() @IsString() @MaxLength(80) title!: string;
  @ApiProperty() @IsString() @MaxLength(240) body!: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) imageUrl?: string;
  @ApiPropertyOptional({ example: 'foodgrid://outlets/spice-route' }) @IsOptional() @IsString() deepLink?: string;
  @ApiProperty({ enum: APP_KINDS }) @IsIn(APP_KINDS) app!: AppKind;
  @ApiPropertyOptional({ type: [String], description: 'Explicit user ids (default: everyone with the app installed)' })
  @IsOptional() @IsArray() @IsString({ each: true })
  userIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
}

const BATCH = 200;

/** Push notification management: marketing campaigns with scheduling and delivery stats. */
@Injectable()
export class PushCampaignsService {
  private readonly logger = new Logger(PushCampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.pushCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  create(createdBy: string, dto: PushCampaignDto) {
    return this.prisma.pushCampaign.create({
      data: {
        title: dto.title,
        body: dto.body,
        imageUrl: dto.imageUrl,
        deepLink: dto.deepLink,
        app: dto.app,
        audience: { userIds: dto.userIds ?? null } as Prisma.InputJsonValue,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        createdBy,
      },
    });
  }

  async cancel(id: string) {
    const c = await this.prisma.pushCampaign.findUnique({ where: { id } });
    if (!c) throw notFound('Campaign', id);
    if (!['DRAFT', 'SCHEDULED'].includes(c.status)) throw conflict('Campaign already sent', 'CAMPAIGN_SENT');
    return this.prisma.pushCampaign.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async send(id: string) {
    const claimed = await this.prisma.pushCampaign.updateMany({ where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } }, data: { status: 'SENDING' } });
    if (!claimed.count) throw conflict('Campaign is not sendable', 'CAMPAIGN_STATE');
    const c = await this.prisma.pushCampaign.findUniqueOrThrow({ where: { id } });
    const explicit = (c.audience as { userIds?: string[] | null }).userIds;
    const users = explicit?.length
      ? explicit
      : (await this.prisma.deviceToken.findMany({ where: { app: c.app, isActive: true }, distinct: ['userId'], select: { userId: true } })).map((d) => d.userId);
    await this.prisma.pushCampaign.update({ where: { id }, data: { targetCount: users.length } });
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < users.length; i += BATCH) {
      const batch = users.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((userId) =>
          this.notifications.send({
            channel: 'PUSH',
            userId,
            app: c.app,
            title: c.title,
            body: c.body,
            data: { deepLink: c.deepLink ?? '', campaignId: c.id, channel: 'marketing' },
            campaignId: c.id,
            marketing: true,
          }),
        ),
      );
      for (const r of results) r.status === 'fulfilled' && r.value.some((n) => n.status === 'SENT') ? ok++ : failed++;
      await this.prisma.pushCampaign.update({ where: { id }, data: { sentCount: ok, failedCount: failed } });
    }
    this.logger.log(`Campaign ${c.title}: ${ok} delivered, ${failed} failed/skipped`);
    return this.prisma.pushCampaign.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
  }

  async due() {
    return this.prisma.pushCampaign.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } }, select: { id: true } });
  }
}
