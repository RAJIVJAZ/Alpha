import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { AccessTokenService, randomToken, sha256 } from '@foodgrid/auth';
import { PrismaService } from '@foodgrid/database/nest';
import type { TenantMember, Tenant, User } from '@foodgrid/database';
import type { AccessTokenClaims, AuthTokens, SessionResponse, SessionUser } from '@foodgrid/types';
import { AppError } from '@foodgrid/utils';
import { REDIS, revokedSessionKey } from '@foodgrid/utils/server';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
}

type MembershipWithTenant = TenantMember & { tenant: Tenant };

const REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);
/** Concurrent refreshes with the same token inside this window are tolerated. */
const ROTATION_GRACE_MS = 15_000;

/**
 * Owns refresh-token families (one per login session) and access-token
 * minting. A family id doubles as the `sid` claim so that revoking a family
 * invalidates outstanding access tokens through the Redis deny-list.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AccessTokenService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async memberships(userId: string): Promise<MembershipWithTenant[]> {
    return this.prisma.tenantMember.findMany({
      where: { userId, status: 'ACTIVE', tenant: { status: { notIn: ['REJECTED', 'SUSPENDED'] } } },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  toSessionUser(
    user: User,
    memberships: MembershipWithTenant[],
    activeTenantId?: string | null,
  ): SessionUser {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      avatarUrl: user.avatarUrl,
      roles: user.roles,
      activeTenantId: activeTenantId ?? undefined,
      memberships: memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        tenantType: m.tenant.type,
        tenantStatus: m.tenant.status,
        role: m.role,
        outletIds: m.outletIds,
      })),
    };
  }

  buildClaims(
    user: User,
    sid: string,
    membership?: MembershipWithTenant | null,
  ): Omit<AccessTokenClaims, 'iat' | 'exp'> {
    return {
      sub: user.id,
      sid,
      roles: user.roles,
      name: user.name ?? undefined,
      phone: user.phone ?? undefined,
      ...(membership
        ? {
            tenantId: membership.tenantId,
            tenantType: membership.tenant.type,
            tenantRole: membership.role,
            outletIds: membership.outletIds,
          }
        : {}),
    };
  }

  /** Starts a new session (refresh-token family) after a successful login. */
  async startSession(user: User, meta: ClientMeta, preferredTenantId?: string | null) {
    if (user.status !== 'ACTIVE')
      throw new AppError('ACCOUNT_BLOCKED', 'This account is not active', 403);
    const memberships = await this.memberships(user.id);
    // Auto-select the business when the user belongs to exactly one.
    const active =
      (preferredTenantId && memberships.find((m) => m.tenantId === preferredTenantId)) ||
      (memberships.length === 1 ? memberships[0] : undefined);

    const familyId = randomUUID();
    const refreshToken = randomToken(48);
    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          familyId,
          tokenHash: sha256(refreshToken),
          tenantId: active?.tenantId ?? null,
          deviceId: meta.deviceId,
          userAgent: meta.userAgent?.slice(0, 500),
          ip: meta.ip,
          expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
        },
      }),
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);

    const tokens: AuthTokens = {
      accessToken: this.tokens.sign(this.buildClaims(user, familyId, active)),
      refreshToken,
      expiresIn: this.tokens.ttlSeconds,
      tokenType: 'Bearer',
    };
    return { tokens, user: this.toSessionUser(user, memberships, active?.tenantId) };
  }

  /** Rotates a refresh token. Detects reuse of rotated tokens and kills the family. */
  async refresh(rawToken: string, meta: ClientMeta): Promise<SessionResponse> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (!current) throw new AppError('REFRESH_INVALID', 'Invalid refresh token', 401);

    if (current.revokedAt) {
      const withinGrace =
        current.revokedReason === 'rotated' &&
        Date.now() - current.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (!withinGrace) {
        await this.revokeFamily(current.familyId, 'reuse-detected');
        this.logger.warn(
          `Refresh token reuse detected for user ${current.userId}, family ${current.familyId}`,
        );
        throw new AppError('REFRESH_REUSED', 'Session expired, please log in again', 401);
      }
    }
    if (current.expiresAt < new Date())
      throw new AppError('REFRESH_EXPIRED', 'Session expired', 401);
    if (current.user.status !== 'ACTIVE') {
      await this.revokeFamily(current.familyId, 'account-inactive');
      throw new AppError('ACCOUNT_BLOCKED', 'This account is not active', 403);
    }

    const memberships = await this.memberships(current.userId);
    // A token replayed inside the grace window may predate a tenant switch; the
    // family's newest token always carries the current selection.
    const tenantId = current.revokedAt
      ? ((
          await this.prisma.refreshToken.findFirst({
            where: { familyId: current.familyId },
            orderBy: { createdAt: 'desc' },
            select: { tenantId: true },
          })
        )?.tenantId ?? null)
      : current.tenantId;
    const active = tenantId ? memberships.find((m) => m.tenantId === tenantId) : undefined;

    const nextRaw = randomToken(48);
    await this.prisma.$transaction(async (tx) => {
      const next = await tx.refreshToken.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: sha256(nextRaw),
          tenantId: active?.tenantId ?? null,
          deviceId: meta.deviceId ?? current.deviceId,
          userAgent: (meta.userAgent ?? current.userAgent)?.slice(0, 500),
          ip: meta.ip ?? current.ip,
          expiresAt: current.expiresAt, // sliding refresh is not extended beyond the original login TTL
        },
      });
      if (!current.revokedAt) {
        await tx.refreshToken.update({
          where: { id: current.id },
          data: { revokedAt: new Date(), revokedReason: 'rotated', replacedById: next.id },
        });
      }
    });

    const tokens: AuthTokens = {
      accessToken: this.tokens.sign(this.buildClaims(current.user, current.familyId, active)),
      refreshToken: nextRaw,
      expiresIn: this.tokens.ttlSeconds,
      tokenType: 'Bearer',
    };
    return { tokens, user: this.toSessionUser(current.user, memberships, active?.tenantId) };
  }

  /**
   * Selects a different (or no) active tenant for the caller's session. The
   * family is rotated exactly like refresh(), so the reply has the login shape
   * and later refreshes keep the new tenant.
   */
  async switchTenant(
    claims: AccessTokenClaims,
    tenantId: string | null | undefined,
    meta: ClientMeta,
  ): Promise<SessionResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: claims.sub } });
    if (user.status !== 'ACTIVE') {
      await this.revokeFamily(claims.sid, 'account-inactive');
      throw new AppError('ACCOUNT_BLOCKED', 'This account is not active', 403);
    }
    const memberships = await this.memberships(user.id);
    let active: MembershipWithTenant | undefined;
    if (tenantId) {
      active = memberships.find((m) => m.tenantId === tenantId);
      if (!active) throw new AppError('NOT_A_MEMBER', 'You are not a member of this business', 403);
    }

    const nextRaw = randomToken(48);
    await this.prisma.$transaction(async (tx) => {
      // Only the access token is presented, so every live token of its family is
      // rotated; the grace window in refresh() still covers in-flight requests.
      const live = await tx.refreshToken.findMany({
        where: {
          familyId: claims.sid,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      const current = live[0];
      if (!current)
        throw new AppError('SESSION_EXPIRED', 'Session expired, please log in again', 401);
      const next = await tx.refreshToken.create({
        data: {
          userId: user.id,
          familyId: claims.sid,
          tokenHash: sha256(nextRaw),
          tenantId: active?.tenantId ?? null,
          deviceId: meta.deviceId ?? current.deviceId,
          userAgent: (meta.userAgent ?? current.userAgent)?.slice(0, 500),
          ip: meta.ip ?? current.ip,
          expiresAt: current.expiresAt,
        },
      });
      await tx.refreshToken.updateMany({
        where: { id: { in: live.map((t) => t.id) }, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'rotated', replacedById: next.id },
      });
    });

    const tokens: AuthTokens = {
      accessToken: this.tokens.sign(this.buildClaims(user, claims.sid, active)),
      refreshToken: nextRaw,
      expiresIn: this.tokens.ttlSeconds,
      tokenType: 'Bearer',
    };
    return { tokens, user: this.toSessionUser(user, memberships, active?.tenantId) };
  }

  async revokeFamily(familyId: string, reason: string) {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    // Outstanding access tokens carry sid=familyId; deny them until they expire.
    await this.redis.set(revokedSessionKey(familyId), reason, 'EX', this.tokens.ttlSeconds + 60);
  }

  async revokeByToken(rawToken: string) {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (token) await this.revokeFamily(token.familyId, 'logout');
  }

  async revokeAllForUser(userId: string, reason = 'revoked-by-admin') {
    const families = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
      select: { familyId: true },
      distinct: ['familyId'],
    });
    for (const f of families) await this.revokeFamily(f.familyId, reason);
    return families.length;
  }

  async listSessions(userId: string, currentSid?: string) {
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      sessionId: r.familyId,
      deviceId: r.deviceId,
      userAgent: r.userAgent,
      ip: r.ip,
      lastUsedAt: r.createdAt,
      expiresAt: r.expiresAt,
      current: r.familyId === currentSid,
    }));
  }

  async revokeSession(userId: string, familyId: string) {
    const owned = await this.prisma.refreshToken.count({ where: { userId, familyId } });
    if (!owned) throw new AppError('NOT_FOUND', 'Session not found', 404);
    await this.revokeFamily(familyId, 'revoked-by-user');
  }
}
