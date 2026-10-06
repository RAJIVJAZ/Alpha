import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { AppKind, NotificationChannel, Prisma } from '@foodgrid/database';
import { istParts, hhmmToMinutes, normalizePage, paginate } from '@foodgrid/utils';
import { businessCounter, InternalHttpService } from '@foodgrid/utils/server';
import { EMAIL_PROVIDER, EmailProvider, PUSH_PROVIDER, PushProvider, SMS_PROVIDER, SmsProvider } from '../providers/providers';
import { DEFAULT_TEMPLATES, render, TemplateContent } from '../templates/defaults';

export interface SendInput {
  channel: NotificationChannel;
  userId?: string | null;
  /** Explicit phone / email when there is no user (e.g. OTP). */
  recipient?: string;
  app?: AppKind;
  templateKey?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  tenantId?: string | null;
  campaignId?: string;
  /** Marketing messages respect opt-outs and quiet hours; transactional ones don't. */
  marketing?: boolean;
}

const sent = businessCounter('notifications_sent_total', 'Notifications dispatched', ['channel', 'status']);

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  private async template(key: string, channel: NotificationChannel): Promise<TemplateContent | null> {
    const row = await this.prisma.notificationTemplate.findUnique({ where: { key_channel_locale: { key, channel, locale: 'en' } } });
    if (row?.isActive) return { title: row.title ?? undefined, body: row.body };
    return DEFAULT_TEMPLATES[key]?.[channel as 'PUSH' | 'SMS' | 'EMAIL' | 'IN_APP'] ?? null;
  }

  private async allowed(userId: string | null | undefined, channel: NotificationChannel, marketing: boolean): Promise<boolean> {
    if (!userId) return true;
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (!pref) return true;
    if (marketing && !pref.marketingEnabled) return false;
    if (channel === 'PUSH' && !pref.pushEnabled && marketing) return false;
    if (channel === 'SMS' && !pref.smsEnabled && marketing) return false;
    if (channel === 'EMAIL' && !pref.emailEnabled && marketing) return false;
    if (marketing && pref.quietHoursStart && pref.quietHoursEnd) {
      const p = istParts();
      const now = p.hour * 60 + p.minute;
      const start = hhmmToMinutes(pref.quietHoursStart);
      const end = hhmmToMinutes(pref.quietHoursEnd);
      const quiet = start <= end ? now >= start && now < end : now >= start || now < end;
      if (quiet) return false;
    }
    return true;
  }

  /** Renders, persists and dispatches one logical notification (fan-out over devices for PUSH). */
  async send(input: SendInput) {
    const data = input.data ?? {};
    const tpl = input.templateKey ? await this.template(input.templateKey, input.channel) : null;
    const title = input.title ?? (tpl?.title ? render(tpl.title, data) : undefined);
    const body = input.body ?? (tpl ? render(tpl.body, data) : '');
    if (!body) {
      this.logger.warn(`No template ${input.templateKey} for ${input.channel}`);
      return [];
    }
    if (!(await this.allowed(input.userId, input.channel, !!input.marketing))) {
      return [await this.record(input, title, body, data, input.recipient ?? input.userId ?? '-', 'SKIPPED')];
    }

    switch (input.channel) {
      case 'PUSH': {
        const devices = input.userId
          ? await this.prisma.deviceToken.findMany({ where: { userId: input.userId, isActive: true, ...(input.app ? { app: input.app } : {}) } })
          : [];
        const results = [];
        for (const d of devices) {
          const res = await this.push.send(d.token, {
            title: title ?? 'FoodGrid',
            body,
            data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
          });
          if (res.invalidToken) await this.prisma.deviceToken.update({ where: { id: d.id }, data: { isActive: false } });
          results.push(await this.record(input, title, body, data, d.token, res.ok ? 'SENT' : 'FAILED', res));
        }
        // always keep an in-app copy so the bell icon shows it
        results.push(await this.record({ ...input, channel: 'IN_APP' }, title, body, data, input.userId ?? '-', 'SENT'));
        return results;
      }
      case 'SMS': {
        const phone = input.recipient ?? (await this.lookupContact(input.userId, 'phone'));
        if (!phone) return [];
        const res = await this.sms.send(phone, body);
        return [await this.record(input, title, body, data, phone, res.ok ? 'SENT' : 'FAILED', res)];
      }
      case 'EMAIL': {
        const email = input.recipient ?? (await this.lookupContact(input.userId, 'email'));
        if (!email) return [];
        const res = await this.email.send(email, title ?? 'FoodGrid', body);
        return [await this.record(input, title, body, data, email, res.ok ? 'SENT' : 'FAILED', res)];
      }
      default:
        return [await this.record(input, title, body, data, input.userId ?? '-', 'SENT')];
    }
  }

  private async lookupContact(userId: string | null | undefined, field: 'phone' | 'email') {
    if (!userId) return null;
    const user = await this.internal.get<{ phone: string | null; email: string | null }>('user', `internal/users/${userId}`).catch(() => null);
    return user?.[field] ?? null;
  }

  private async record(
    input: SendInput,
    title: string | undefined,
    body: string,
    data: Record<string, unknown>,
    recipient: string,
    status: 'SENT' | 'FAILED' | 'SKIPPED',
    res?: { providerMessageId?: string; error?: string },
  ) {
    sent.inc({ channel: input.channel, status });
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        recipient,
        channel: input.channel,
        templateKey: input.templateKey,
        title,
        body,
        data: data as Prisma.InputJsonValue,
        status,
        provider: input.channel === 'PUSH' ? this.push.name : input.channel === 'SMS' ? this.sms.name : input.channel === 'EMAIL' ? this.email.name : 'in-app',
        providerMessageId: res?.providerMessageId,
        error: res?.error,
        attempts: 1,
        campaignId: input.campaignId,
        sentAt: status === 'SENT' ? new Date() : null,
      },
    });
  }

  /** Sends to the active members of a business (e.g. new order → owners & cashiers). */
  async toTenant(tenantId: string, roles: string[], input: Omit<SendInput, 'userId' | 'tenantId'>) {
    const members = await this.internal
      .get<{ userId: string; role: string }[]>('user', `internal/tenants/${tenantId}/members`, { query: { roles: roles.join(',') } })
      .catch(() => [] as { userId: string; role: string }[]);
    for (const m of members) await this.send({ ...input, userId: m.userId, tenantId, app: input.app ?? 'MERCHANT' });
    return members.length;
  }

  // ─── inbox & devices ──────────────────────────────────────────────────────
  async inbox(userId: string, page = 1) {
    const p = normalizePage({ page, pageSize: 30 });
    const where = { userId, channel: 'IN_APP' as const };
    const [rows, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { ...paginate(rows, total, p.page, p.pageSize), unread };
  }

  markRead(userId: string, id?: string) {
    return this.prisma.notification.updateMany({
      where: { userId, channel: 'IN_APP', readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date(), status: 'READ' },
    });
  }

  registerDevice(userId: string, token: string, platform: 'ANDROID' | 'IOS' | 'WEB', app: AppKind) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform, app },
      update: { userId, platform, app, isActive: true, lastSeenAt: new Date() },
    });
  }

  removeDevice(userId: string, token: string) {
    return this.prisma.deviceToken.updateMany({ where: { userId, token }, data: { isActive: false } });
  }

  preferences(userId: string) {
    return this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  updatePreferences(userId: string, data: Prisma.NotificationPreferenceUpdateInput) {
    return this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId, ...(data as object) }, update: data });
  }
}
