import { Injectable, Logger } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { PrismaService } from '@foodgrid/database/nest';
import type { AppKind, Prisma } from '@foodgrid/database';
import { APP_KINDS } from '@foodgrid/types';
import { conflict, notFound } from '@foodgrid/utils';
import { NotificationsService } from '../notifications/notifications.service';

export class PushCampaignDto {
  @ApiProperty() @IsString() @MaxLength(80) title!: string;
  @ApiProperty() @IsString() @MaxLength(240) body!: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) imageUrl?: string;
  @ApiPropertyOptional({ example: 'foodgrid://outlets/spice-route' })
  @IsOptional()
  @IsString()
  deepLink?: string;
  @ApiProperty({ enum: APP_KINDS }) @IsIn(APP_KINDS) app!: AppKind;
  @ApiPropertyOptional({
    type: [String],
    description: 'Explicit user ids (default: everyone with the app installed)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
    // a campaign that is sending stops after the batch in flight
    if (!['DRAFT', 'SCHEDULED', 'SENDING'].includes(c.status))
      throw conflict('Campaign already sent', 'CAMPAIGN_SENT');
    return this.prisma.pushCampaign.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /** Claims the campaign and sends it in the background; the response shows it SENDING. */
  async send(id: string) {
    await this.claim(id);
    void this.deliver(id).catch((err: Error) =>
      this.logger.error(`Campaign ${id} stopped: ${err.message} (resumes in a few minutes)`),
    );
    return this.prisma.pushCampaign.findUniqueOrThrow({ where: { id } });
  }

  /** Claims and sends to the end (the scheduled-campaign job). */
  async sendNow(id: string) {
    await this.claim(id);
    return this.deliver(id);
  }

  private async claim(id: string) {
    const claimed = await this.prisma.pushCampaign.updateMany({
      where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } },
      data: { status: 'SENDING' },
    });
    if (!claimed.count) throw conflict('Campaign is not sendable', 'CAMPAIGN_STATE');
  }

  /**
   * Sends to everyone in the audience not yet processed, so a campaign interrupted by a
   * restart resumes where it stopped. Every batch saves progress (which also marks the
   * campaign alive) and stops if the campaign was cancelled meanwhile.
   */
  async deliver(id: string) {
    const c = await this.prisma.pushCampaign.findUniqueOrThrow({ where: { id } });
    if (c.status !== 'SENDING') return c;
    const explicit = (c.audience as { userIds?: string[] | null }).userIds;
    const users = explicit?.length
      ? explicit
      : (
          await this.prisma.deviceToken.findMany({
            where: { app: c.app, isActive: true },
            distinct: ['userId'],
            select: { userId: true },
          })
        ).map((d) => d.userId);
    // a processed user has a row for the campaign (push, skip or customer in-app copy); one
    // with no device for the app has none and is simply tried again, which sends nothing
    const processed = new Set(
      (
        await this.prisma.notification.findMany({
          where: { campaignId: id },
          distinct: ['userId'],
          select: { userId: true },
        })
      ).map((n) => n.userId),
    );
    const delivered = await this.prisma.notification.findMany({
      where: { campaignId: id, channel: 'PUSH', status: 'SENT' },
      distinct: ['userId'],
      select: { userId: true },
    });
    let ok = delivered.length;
    let failed = processed.size - ok;
    const todo = users.filter((u) => !processed.has(u));
    await this.prisma.pushCampaign.update({
      where: { id },
      data: { targetCount: Math.max(users.length, processed.size) },
    });
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((userId) =>
          this.notifications.send({
            channel: 'PUSH',
            userId,
            app: c.app,
            title: c.title,
            body: c.body,
            imageUrl: c.imageUrl ?? undefined,
            data: { deepLink: c.deepLink ?? '', campaignId: c.id, channel: 'marketing' },
            campaignId: c.id,
            marketing: true,
          }),
        ),
      );
      for (const r of results) {
        // a customer in-app copy is always SENT, so only a push to a device counts as delivered
        if (
          r.status === 'fulfilled' &&
          r.value.some((n) => n.channel === 'PUSH' && n.status === 'SENT')
        )
          ok++;
        else failed++;
      }
      const alive = await this.prisma.pushCampaign.updateMany({
        where: { id, status: 'SENDING' },
        data: { sentCount: ok, failedCount: failed },
      });
      if (!alive.count) {
        this.logger.log(`Campaign ${c.title} cancelled after ${ok + failed} recipients`);
        return this.prisma.pushCampaign.findUniqueOrThrow({ where: { id } });
      }
    }
    this.logger.log(`Campaign ${c.title}: ${ok} delivered, ${failed} failed/skipped`);
    await this.prisma.pushCampaign.updateMany({
      where: { id, status: 'SENDING' },
      data: { status: 'SENT', sentAt: new Date(), sentCount: ok, failedCount: failed },
    });
    return this.prisma.pushCampaign.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Campaigns left SENDING with no progress since the cutoff (the pod sending them stopped).
   * Each is re-claimed by bumping updatedAt, so only one replica resumes it.
   */
  async stalled(cutoff: Date) {
    const rows = await this.prisma.pushCampaign.findMany({
      where: { status: 'SENDING', updatedAt: { lt: cutoff } },
      select: { id: true },
    });
    const ids: string[] = [];
    for (const r of rows) {
      const claimed = await this.prisma.pushCampaign.updateMany({
        where: { id: r.id, status: 'SENDING', updatedAt: { lt: cutoff } },
        data: { updatedAt: new Date() },
      });
      if (claimed.count) ids.push(r.id);
    }
    return ids;
  }

  async due() {
    return this.prisma.pushCampaign.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      select: { id: true },
    });
  }
}
