import { createPublicKey, randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AccessTokenClaims, ServiceTokenClaims } from '@foodgrid/types';

export interface TokenConfig {
  /** PEM. Only auth-service needs the private key. */
  privateKey?: string;
  publicKey: string;
  issuer: string;
  audience: string;
  accessTtlSeconds: number;
  keyId?: string;
}

export class TokenError extends Error {
  constructor(
    message: string,
    public readonly reason: 'expired' | 'invalid' | 'missing' = 'invalid',
  ) {
    super(message);
    this.name = 'TokenError';
  }
}

const decodePem = (value?: string) =>
  value ? (value.includes('BEGIN') ? value : Buffer.from(value, 'base64').toString('utf8')) : undefined;

export function tokenConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TokenConfig {
  const publicKey = decodePem(env.JWT_PUBLIC_KEY_BASE64 ?? env.JWT_PUBLIC_KEY);
  if (!publicKey) throw new Error('JWT_PUBLIC_KEY_BASE64 is not configured');
  return {
    privateKey: decodePem(env.JWT_PRIVATE_KEY_BASE64 ?? env.JWT_PRIVATE_KEY),
    publicKey,
    issuer: env.JWT_ISSUER ?? 'https://auth.foodgrid.local',
    audience: env.JWT_AUDIENCE ?? 'foodgrid-api',
    accessTtlSeconds: Number(env.JWT_ACCESS_TTL_SECONDS ?? 900),
    keyId: env.JWT_KEY_ID ?? 'foodgrid-1',
  };
}

/** RS256 access tokens. Signing requires the private key (auth-service only). */
export class AccessTokenService {
  constructor(private readonly config: TokenConfig) {}

  get ttlSeconds() {
    return this.config.accessTtlSeconds;
  }

  sign(claims: Omit<AccessTokenClaims, 'iat' | 'exp' | 'iss' | 'aud'>): string {
    if (!this.config.privateKey) throw new Error('Private key not available for signing');
    const { sub, ...rest } = claims;
    return jwt.sign(rest, this.config.privateKey, {
      algorithm: 'RS256',
      subject: sub,
      issuer: this.config.issuer,
      audience: this.config.audience,
      expiresIn: this.config.accessTtlSeconds,
      ...(this.config.keyId ? { keyid: this.config.keyId } : {}),
    });
  }

  verify(token: string): AccessTokenClaims {
    if (!token) throw new TokenError('Missing token', 'missing');
    try {
      const decoded = jwt.verify(token, this.config.publicKey, {
        algorithms: ['RS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
      if (typeof decoded === 'string') throw new TokenError('Malformed token');
      return decoded as AccessTokenClaims;
    } catch (err) {
      if (err instanceof TokenError) throw err;
      if (err instanceof jwt.TokenExpiredError) throw new TokenError('Token expired', 'expired');
      throw new TokenError((err as Error).message);
    }
  }

  /** JSON Web Key Set exposing the public key (for gateways / external verifiers). */
  jwks() {
    const jwk = createPublicKey(this.config.publicKey).export({ format: 'jwk' });
    return { keys: [{ ...jwk, kid: this.config.keyId ?? 'default', use: 'sig', alg: 'RS256' }] };
  }
}

/** HS256 tokens used for service-to-service calls on the internal network. */
export function signServiceToken(
  secret: string,
  service: string,
  extra: Omit<ServiceTokenClaims, 'sub' | 'typ'> = {},
  ttlSeconds = 60,
): string {
  return jwt.sign({ ...extra, typ: 'service' }, secret, {
    algorithm: 'HS256',
    subject: service,
    expiresIn: ttlSeconds,
    audience: 'foodgrid-internal',
  });
}

export function verifyServiceToken(secret: string, token: string): ServiceTokenClaims {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'], audience: 'foodgrid-internal' });
    if (typeof decoded === 'string' || (decoded as ServiceTokenClaims).typ !== 'service') {
      throw new TokenError('Not a service token');
    }
    return decoded as ServiceTokenClaims;
  } catch (err) {
    if (err instanceof TokenError) throw err;
    throw new TokenError((err as Error).message);
  }
}

/** Cryptographically random opaque token (refresh tokens, QR tokens ...). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const hmacSha256 = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function extractBearer(header?: string | string[] | null): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const [scheme, token] = value.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
