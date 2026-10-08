import { createHash, randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import { AppError, badRequest, conflict, notFound } from '@foodgrid/utils';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';
import { AddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/profile.dto';

const EMAIL_CODE_TTL_SECONDS = 15 * 60;
/** Code attempts per user per hour, across re-sent codes, so 6 digits cannot be brute-forced. */
const EMAIL_CODE_MAX_ATTEMPTS = 10;
const emailKeys = {
  pending: (userId: string) => `profile:email-verify:${userId}`,
  attempts: (userId: string) => `profile:email-verify-attempts:${userId}`,
};
const hashCode = (userId: string, email: string, code: string) =>
  createHash('sha256').update(`${userId}:${email}:${code}`).digest('hex');

const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  phone: true,
  email: true,
  avatarUrl: true,
  roles: true,
  referralCode: true,
  preferences: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  get(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: PUBLIC_USER_FIELDS,
    });
  }

  /**
   * An email is only ever stored once its owner proves they read it (a code sent to it): sign-in
   * with Google links to the account holding that email, so it must not be claimable.
   */
  async update(userId: string, dto: UpdateProfileDto) {
    const { email, ...rest } = dto;
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const pendingEmail = email?.toLowerCase();
    const emailVerification =
      pendingEmail && pendingEmail !== current.email
        ? await this.startEmailVerification(userId, pendingEmail)
        : undefined;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: rest.name,
        avatarUrl: rest.avatarUrl,
        preferences: rest.preferences as Prisma.InputJsonValue | undefined,
      },
      select: PUBLIC_USER_FIELDS,
    });
    return emailVerification ? { ...user, emailVerification } : user;
  }

  private async startEmailVerification(userId: string, email: string) {
    await this.assertEmailFree(userId, email);
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.set(
      emailKeys.pending(userId),
      JSON.stringify({ email, codeHash: hashCode(userId, email, code) }),
      'EX',
      EMAIL_CODE_TTL_SECONDS,
    );
    // Delivery is best-effort, like OTP SMS: the user can ask for a new code.
    this.internal
      .post('notification', 'internal/notifications/send', {
        userId,
        channel: 'EMAIL',
        recipient: email,
        title: 'Confirm your email',
        body: `Your FoodGrid code is ${code}. It expires in ${EMAIL_CODE_TTL_SECONDS / 60} minutes.`,
      })
      .catch((err: Error) =>
        this.logger.warn(`Email verification for ${userId} not sent: ${err.message}`),
      );
    const expose =
      process.env.NODE_ENV !== 'production' && process.env.OTP_EXPOSE_IN_RESPONSE === 'true';
    return {
      pendingEmail: email,
      expiresInSeconds: EMAIL_CODE_TTL_SECONDS,
      ...(expose ? { devCode: code } : {}),
    };
  }

  async verifyEmail(userId: string, code: string) {
    // counted before checking, so parallel guesses cannot get past the limit
    const attempts = await this.redis.incr(emailKeys.attempts(userId));
    if (attempts === 1) await this.redis.expire(emailKeys.attempts(userId), 3600);
    if (attempts > EMAIL_CODE_MAX_ATTEMPTS)
      throw new AppError('EMAIL_CODE_LOCKED', 'Too many attempts, try again in an hour', 429);
    const raw = await this.redis.get(emailKeys.pending(userId));
    if (!raw) throw badRequest('Ask for a new code first', 'EMAIL_CODE_EXPIRED');
    const pending = JSON.parse(raw) as { email: string; codeHash: string };
    if (pending.codeHash !== hashCode(userId, pending.email, code))
      throw badRequest('That code is not right', 'EMAIL_CODE_INVALID');
    await this.redis.del(emailKeys.pending(userId), emailKeys.attempts(userId));
    await this.assertEmailFree(userId, pending.email);
    return this.prisma.user.update({
      where: { id: userId },
      data: { email: pending.email, emailVerifiedAt: new Date() },
      select: PUBLIC_USER_FIELDS,
    });
  }

  private async assertEmailFree(userId: string, email: string) {
    const taken = await this.prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
    if (taken) throw conflict('Email already in use', 'EMAIL_TAKEN');
  }

  listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async addAddress(userId: string, dto: AddressDto) {
    const count = await this.prisma.address.count({ where: { userId } });
    const makeDefault = dto.isDefault || count === 0;
    return this.prisma.$transaction(async (tx) => {
      if (makeDefault)
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({ data: { ...dto, userId, isDefault: makeDefault } });
    });
  }

  async updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw notFound('Address', id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault)
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: dto });
    });
  }

  async deleteAddress(userId: string, id: string) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw notFound('Address', id);
    await this.prisma.address.delete({ where: { id } });
    if (existing.isDefault) {
      const next = await this.prisma.address.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      });
      if (next)
        await this.prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }
}
