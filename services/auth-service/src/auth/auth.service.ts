import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import bcrypt from 'bcryptjs';
import { PrismaService } from '@foodgrid/database/nest';
import type { User } from '@foodgrid/database';
import { EventTypes, LoginResponse, UserRegisteredEvent } from '@foodgrid/types';
import { AppError } from '@foodgrid/utils';
import { InternalHttpService, OutboxService, REDIS } from '@foodgrid/utils/server';
import { GoogleTokenVerifier } from './google-verifier';
import {
  generateOtp,
  hashOtp,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_HOUR,
  OTP_MAX_PER_IP_PER_HOUR,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  otpKeys,
  verifyOtpHash,
} from './domain/otp';
import { maskPhone, normalizePhone } from './domain/phone';
import { generateReferralCode } from './domain/referral';
import { ClientMeta, SessionService } from './session.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly otpSecret = process.env.OTP_SECRET ?? 'dev-otp-secret';
  private readonly testNumbers = new Set(
    (process.env.OTP_TEST_NUMBERS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly google: GoogleTokenVerifier,
    private readonly outbox: OutboxService,
    private readonly internal: InternalHttpService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // ─── OTP ────────────────────────────────────────────────────────────────
  async requestOtp(rawPhone: string, meta: ClientMeta) {
    const phone = normalizePhone(rawPhone);
    await this.enforceOtpRateLimits(phone, meta.ip);

    const code = this.testNumbers.has(phone) ? '123456' : generateOtp();
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        phone,
        codeHash: hashOtp(this.otpSecret, phone, code),
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
        ip: meta.ip,
      },
    });

    // Delivery is best-effort: a notification outage must not leak the code or block login retries.
    this.internal
      .post('notification', 'internal/notifications/sms', {
        phone,
        templateKey: 'auth.otp',
        data: { code, minutes: OTP_TTL_SECONDS / 60 },
      })
      .catch((err: Error) =>
        this.logger.warn(`OTP SMS to ${maskPhone(phone)} not sent: ${err.message}`),
      );

    const expose =
      process.env.NODE_ENV !== 'production' && process.env.OTP_EXPOSE_IN_RESPONSE === 'true';
    return {
      challengeId: challenge.id,
      phone: maskPhone(phone),
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      ...(expose ? { devCode: code } : {}),
    };
  }

  private async enforceOtpRateLimits(phone: string, ip?: string) {
    const cooldown = await this.redis.set(
      otpKeys.cooldown(phone),
      '1',
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX',
    );
    if (!cooldown) {
      const ttl = await this.redis.ttl(otpKeys.cooldown(phone));
      throw new AppError(
        'OTP_COOLDOWN',
        `Please wait ${ttl}s before requesting another code`,
        429,
        { retryAfter: ttl },
      );
    }
    const hourly = await this.redis.incr(otpKeys.hourly(phone));
    if (hourly === 1) await this.redis.expire(otpKeys.hourly(phone), 3600);
    if (hourly > OTP_MAX_PER_HOUR)
      throw new AppError('OTP_RATE_LIMITED', 'Too many OTP requests, try later', 429);
    if (ip) {
      const perIp = await this.redis.incr(otpKeys.ip(ip));
      if (perIp === 1) await this.redis.expire(otpKeys.ip(ip), 3600);
      if (perIp > OTP_MAX_PER_IP_PER_HOUR)
        throw new AppError('OTP_RATE_LIMITED', 'Too many OTP requests', 429);
    }
  }

  async verifyOtp(
    input: { phone: string; code: string; referralCode?: string },
    meta: ClientMeta,
  ): Promise<LoginResponse> {
    const phone = normalizePhone(input.phone);
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, purpose: 'LOGIN', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || challenge.expiresAt < new Date()) {
      throw new AppError('OTP_EXPIRED', 'The code has expired, request a new one', 400);
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new AppError('OTP_LOCKED', 'Too many incorrect attempts, request a new code', 429);
    }
    if (!verifyOtpHash(this.otpSecret, phone, input.code, challenge.codeHash)) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = challenge.maxAttempts - challenge.attempts - 1;
      throw new AppError('OTP_INVALID', 'Incorrect code', 400, {
        remainingAttempts: Math.max(0, remaining),
      });
    }
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw new AppError('OTP_EXPIRED', 'The code was already used', 400);
    await this.redis.del(otpKeys.cooldown(phone));

    const { user, isNew } = await this.findOrCreateByPhone(phone, input.referralCode);
    const session = await this.sessions.startSession(user, meta);
    return { ...session, isNewUser: isNew };
  }

  private async findOrCreateByPhone(phone: string, referralCode?: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      if (!existing.phoneVerifiedAt) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { phoneVerifiedAt: new Date() },
        });
      }
      return { user: existing, isNew: false };
    }
    const referrer = referralCode
      ? await this.prisma.user.findUnique({ where: { referralCode: referralCode.toUpperCase() } })
      : null;
    const user = await this.createUser({
      phone,
      phoneVerifiedAt: new Date(),
      referredBy: referrer?.id ?? null,
    });
    return { user, isNew: true };
  }

  private async createUser(data: {
    phone?: string;
    email?: string;
    name?: string;
    avatarUrl?: string;
    phoneVerifiedAt?: Date;
    emailVerifiedAt?: Date;
    referredBy?: string | null;
  }): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { ...data, roles: ['CUSTOMER'], referralCode: generateReferralCode() },
      });
      await this.outbox.enqueue<UserRegisteredEvent>(tx, {
        stream: 'identity',
        type: EventTypes.UserRegistered,
        aggregateType: 'User',
        aggregateId: user.id,
        data: {
          userId: user.id,
          phone: user.phone,
          email: user.email,
          name: user.name,
          referredBy: user.referredBy,
        },
      });
      return user;
    });
  }

  // ─── Google ─────────────────────────────────────────────────────────────
  async loginWithGoogle(idToken: string, meta: ClientMeta): Promise<LoginResponse> {
    const profile = await this.google.verify(idToken);
    if (!profile.emailVerified)
      throw new AppError('EMAIL_UNVERIFIED', 'Google email is not verified', 401);

    const account = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: profile.sub } },
      include: { user: true },
    });
    let user = account?.user;
    let isNew = false;
    if (!user) {
      const holder = await this.prisma.user.findUnique({ where: { email: profile.email } });
      // only an account that proved it owns the address may be linked; anyone can type an email
      if (holder && !holder.emailVerifiedAt)
        throw new AppError(
          'EMAIL_NOT_CONFIRMED',
          'This email is on an account that has not confirmed it. Sign in with your phone and confirm the email first.',
          409,
        );
      user =
        holder ??
        (await this.createUser({
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture,
          emailVerifiedAt: new Date(),
        }));
      isNew = !account && user.createdAt.getTime() > Date.now() - 5000;
      await this.prisma.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: 'GOOGLE',
          providerAccountId: profile.sub,
          email: profile.email,
        },
      });
    }
    const session = await this.sessions.startSession(user, meta);
    return { ...session, isNewUser: isNew };
  }

  // ─── Password (back-office / merchant staff) ───────────────────────────
  async loginWithPassword(
    email: string,
    password: string,
    meta: ClientMeta,
  ): Promise<LoginResponse> {
    const key = `pwd:fail:${email.toLowerCase()}`;
    const failures = Number((await this.redis.get(key)) ?? 0);
    if (failures >= 5)
      throw new AppError('LOGIN_LOCKED', 'Too many failed attempts, try again in 15 minutes', 429);

    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const ok = !!user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !ok) {
      await this.redis.multi().incr(key).expire(key, 900).exec();
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    await this.redis.del(key);
    const session = await this.sessions.startSession(user, meta);
    return { ...session, isNewUser: false };
  }

  async me(userId: string, activeTenantId?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.sessions.toSessionUser(
      user,
      await this.sessions.memberships(userId),
      activeTenantId,
    );
  }
}
