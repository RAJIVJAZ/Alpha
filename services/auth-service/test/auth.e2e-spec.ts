import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type Redis from 'ioredis';
import request from 'supertest';
import type { TenantRole, TenantType } from '@foodgrid/database';
import { PrismaService } from '@foodgrid/database/nest';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueServiceToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { SERVICE } from '../src/service.config';

describe('auth-service (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['identity', 'platform']);
    await redis.flushdb();
    http.reset();
    http.on('POST', 'notification', 'internal/notifications/sms', { queued: true });
  });

  afterAll(async () => {
    await app.close();
  });

  async function otpLogin(phone: string) {
    const req = await api().post('/api/v1/auth/otp/request').send({ phone }).expect(200);
    return api()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: req.body.devCode })
      .expect(200);
  }

  const claimsOf = (accessToken: string) =>
    JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'));

  async function joinBusiness(userId: string, name: string, type: TenantType, role: TenantRole) {
    const tenant = await prisma.tenant.create({
      data: { name, type, status: 'ACTIVE', slug: name.toLowerCase().replace(/\W+/g, '-') },
    });
    await prisma.tenantMember.create({ data: { tenantId: tenant.id, userId, role } });
    return tenant;
  }

  const switchTenant = (accessToken: string, tenantId: string | null) =>
    api()
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tenantId });
  const refresh = (refreshToken: string) =>
    api().post('/api/v1/auth/refresh').send({ refreshToken });

  it('signs up a new customer with phone OTP and sends the code by SMS', async () => {
    const res = await otpLogin('9876543210');

    expect(res.body.isNewUser).toBe(true);
    expect(res.body.user).toMatchObject({ phone: '+919876543210', roles: ['CUSTOMER'] });
    expect(res.body.tokens).toMatchObject({
      tokenType: 'Bearer',
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    const sms = http.callsTo('notification', 'internal/notifications/sms');
    expect(sms).toHaveLength(1);
    expect(sms[0]!.body).toMatchObject({ phone: '+919876543210', templateKey: 'auth.otp' });

    const me = await api()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.tokens.accessToken}`)
      .expect(200);
    expect(me.body.id).toBe(res.body.user.id);
    // second login is not a sign-up
    await redis.flushdb();
    expect((await otpLogin('+91 98765 43210')).body.isNewUser).toBe(false);
  });

  it('rejects wrong codes, counts attempts and locks the challenge', async () => {
    const phone = '9000000001';
    const { body } = await api().post('/api/v1/auth/otp/request').send({ phone }).expect(200);
    const wrong = body.devCode === '000000' ? '111111' : '000000';

    const first = await api()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: wrong })
      .expect(400);
    expect(first.body).toMatchObject({ code: 'OTP_INVALID', details: { remainingAttempts: 4 } });
    for (let i = 0; i < 4; i++)
      await api().post('/api/v1/auth/otp/verify').send({ phone, code: wrong }).expect(400);
    // even the right code is refused once the challenge is locked
    const locked = await api()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: body.devCode })
      .expect(429);
    expect(locked.body.code).toBe('OTP_LOCKED');
  });

  it('enforces the resend cooldown', async () => {
    await api().post('/api/v1/auth/otp/request').send({ phone: '9000000002' }).expect(200);
    const again = await api()
      .post('/api/v1/auth/otp/request')
      .send({ phone: '9000000002' })
      .expect(429);
    expect(again.body.code).toBe('OTP_COOLDOWN');
  });

  it('rotates refresh tokens, tolerates a concurrent retry and kills the family on reuse', async () => {
    const login = await otpLogin('9000000003');
    const first = login.body.tokens.refreshToken as string;

    const rotated = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first })
      .expect(200);
    const second = rotated.body.tokens.refreshToken as string;
    expect(second).not.toBe(first);

    // a retry of the same token within the grace window (e.g. two tabs) still succeeds
    await api().post('/api/v1/auth/refresh').send({ refreshToken: first }).expect(200);

    // after the grace window, presenting the rotated token again is treated as theft
    await prisma.refreshToken.updateMany({
      where: { revokedReason: 'rotated' },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    const reused = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first })
      .expect(401);
    expect(reused.body.code).toBe('REFRESH_REUSED');

    // every token in the family is now dead, and so are its access tokens
    const afterReuse = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second })
      .expect(401);
    expect(afterReuse.body.code).toBe('REFRESH_REUSED');
    const me = await api()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.tokens.accessToken}`)
      .expect(401);
    expect(me.body.code).toBe('SESSION_REVOKED');
  });

  it('switches business with the login shape, rotating the refresh token within the session', async () => {
    const login = await otpLogin('9000000006');
    const userId = login.body.user.id as string;
    const kitchen = await joinBusiness(userId, 'Spice Test Kitchen', 'RESTAURANT', 'OWNER');
    const mill = await joinBusiness(userId, 'Test Mills', 'SUPPLIER', 'MANAGER');

    const switched = await switchTenant(login.body.tokens.accessToken, kitchen.id).expect(200);
    expect(Object.keys(switched.body).sort()).toEqual(['tokens', 'user']);
    expect(Object.keys(switched.body.tokens).sort()).toEqual([
      'accessToken',
      'expiresIn',
      'refreshToken',
      'tokenType',
    ]);
    expect(switched.body.tokens).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: expect.any(Number),
    });
    expect(switched.body.tokens.refreshToken).not.toBe(login.body.tokens.refreshToken);
    expect(switched.body.user).toMatchObject({ id: userId, activeTenantId: kitchen.id });
    expect(switched.body.user.memberships).toHaveLength(2);
    const sid = claimsOf(login.body.tokens.accessToken).sid;
    expect(claimsOf(switched.body.tokens.accessToken)).toMatchObject({
      sid,
      tenantId: kitchen.id,
      tenantType: 'RESTAURANT',
      tenantRole: 'OWNER',
    });

    // same family: the login token is rotated (not killed) and replaced by the new one
    const family = await prisma.refreshToken.findMany({
      where: { familyId: sid },
      orderBy: { createdAt: 'asc' },
    });
    expect(family).toHaveLength(2);
    expect(family[0]).toMatchObject({ revokedReason: 'rotated', replacedById: family[1]!.id });
    expect(family[1]).toMatchObject({ revokedAt: null, tenantId: kitchen.id });

    // later refreshes keep the business that was switched to
    const refreshed = await refresh(switched.body.tokens.refreshToken).expect(200);
    expect(claimsOf(refreshed.body.tokens.accessToken)).toMatchObject({
      sid,
      tenantId: kitchen.id,
    });
    expect(refreshed.body.user.activeTenantId).toBe(kitchen.id);

    const toMill = await switchTenant(refreshed.body.tokens.accessToken, mill.id).expect(200);
    expect(claimsOf(toMill.body.tokens.accessToken)).toMatchObject({
      tenantType: 'SUPPLIER',
      tenantRole: 'MANAGER',
    });

    // null clears the business (consumer mode), and that sticks across refreshes too
    const consumer = await switchTenant(toMill.body.tokens.accessToken, null).expect(200);
    expect(consumer.body.user.activeTenantId).toBeUndefined();
    expect(claimsOf(consumer.body.tokens.accessToken).tenantId).toBeUndefined();
    const later = await refresh(consumer.body.tokens.refreshToken).expect(200);
    expect(claimsOf(later.body.tokens.accessToken).tenantId).toBeUndefined();
    expect(claimsOf(later.body.tokens.accessToken).sid).toBe(sid);
  });

  it('honours a pre-switch refresh token only inside the grace window', async () => {
    const login = await otpLogin('9000000007');
    const kitchen = await joinBusiness(login.body.user.id, 'Grace Kitchen', 'RESTAURANT', 'CHEF');
    const switched = await switchTenant(login.body.tokens.accessToken, kitchen.id).expect(200);

    // an in-flight refresh that raced the switch still lands in the new business
    const raced = await refresh(login.body.tokens.refreshToken).expect(200);
    expect(claimsOf(raced.body.tokens.accessToken).tenantId).toBe(kitchen.id);

    await prisma.refreshToken.updateMany({
      where: { revokedReason: 'rotated' },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    const reused = await refresh(login.body.tokens.refreshToken).expect(401);
    expect(reused.body.code).toBe('REFRESH_REUSED');
    // reuse of the rotated token kills the whole family, including the switched session
    await refresh(switched.body.tokens.refreshToken).expect(401);
  });

  it('refuses businesses the user is not a member of without touching the session', async () => {
    const login = await otpLogin('9000000008');
    const stranger = await prisma.user.create({ data: { phone: '+919000000009' } });
    const other = await joinBusiness(stranger.id, 'Not Mine', 'RESTAURANT', 'OWNER');

    const res = await switchTenant(login.body.tokens.accessToken, other.id).expect(403);
    expect(res.body.code).toBe('NOT_A_MEMBER');
    await switchTenant('not-a-token', null).expect(401);
    // nothing was rotated, so the login refresh token is still the live one
    await refresh(login.body.tokens.refreshToken).expect(200);
  });

  it('logs staff in with a password and locks out after repeated failures', async () => {
    await prisma.user.create({
      data: {
        email: 'owner@test.dev',
        name: 'Owner',
        passwordHash: await bcrypt.hash('Correct#123', 4),
      },
    });

    const ok = await api()
      .post('/api/v1/auth/password')
      .send({ email: 'Owner@Test.dev', password: 'Correct#123' })
      .expect(200);
    expect(ok.body.user.email).toBe('owner@test.dev');

    for (let i = 0; i < 5; i++) {
      const bad = await api()
        .post('/api/v1/auth/password')
        .send({ email: 'owner@test.dev', password: 'wrong-password' })
        .expect(401);
      expect(bad.body.code).toBe('INVALID_CREDENTIALS');
    }
    const locked = await api()
      .post('/api/v1/auth/password')
      .send({ email: 'owner@test.dev', password: 'Correct#123' })
      .expect(429);
    expect(locked.body.code).toBe('LOGIN_LOCKED');
  });

  it('validates request bodies with the platform error envelope', async () => {
    const res = await api()
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '9000000004', code: '12ab' })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      requestId: expect.any(String),
    });
    expect(res.body.details.errors).toEqual([expect.stringContaining('6 digits')]);
  });

  it('publishes its signing key and guards internal routes with service tokens', async () => {
    const jwks = await api().get('/.well-known/jwks.json').expect(200);
    expect(jwks.body.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' });

    const login = await otpLogin('9000000005');
    const userId = login.body.user.id as string;
    await api().post('/api/v1/internal/auth/revoke-user-sessions').send({ userId }).expect(401);
    await api()
      .post('/api/v1/internal/auth/revoke-user-sessions')
      .set('Authorization', `Bearer ${login.body.tokens.accessToken}`)
      .send({ userId })
      .expect(401);
    const revoked = await api()
      .post('/api/v1/internal/auth/revoke-user-sessions')
      .set('x-service-token', issueServiceToken('user-service'))
      .send({ userId })
      .expect(200);
    expect(revoked.body.revoked).toBe(1);
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.tokens.refreshToken })
      .expect(401);
  });
});
