import { generateKeyPairSync } from 'node:crypto';
import {
  AccessTokenService,
  extractBearer,
  signServiceToken,
  TokenError,
  verifyServiceToken,
  safeEqual,
} from './tokens';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const config = {
  privateKey,
  publicKey,
  issuer: 'https://auth.test',
  audience: 'foodgrid-api',
  accessTtlSeconds: 60,
  keyId: 'test',
};

describe('AccessTokenService', () => {
  const svc = new AccessTokenService(config);

  it('round-trips claims', () => {
    const token = svc.sign({
      sub: 'u1',
      roles: ['CUSTOMER'],
      sid: 's1',
      tenantId: 't1',
      tenantRole: 'OWNER',
    });
    const claims = svc.verify(token);
    expect(claims.sub).toBe('u1');
    expect(claims.tenantId).toBe('t1');
    expect(claims.iss).toBe('https://auth.test');
  });

  it('rejects tokens signed by another key', () => {
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const forged = new AccessTokenService({
      ...config,
      privateKey: other.privateKey,
      publicKey: other.publicKey,
    });
    const token = forged.sign({ sub: 'attacker', roles: ['ADMIN'], sid: 'x' });
    expect(() => svc.verify(token)).toThrow(TokenError);
  });

  it('verify-only instances cannot sign', () => {
    const verifier = new AccessTokenService({ ...config, privateKey: undefined });
    expect(() => verifier.sign({ sub: 'u', roles: [], sid: 's' })).toThrow();
  });

  it('flags expired tokens', () => {
    const shortLived = new AccessTokenService({ ...config, accessTtlSeconds: -10 });
    const token = shortLived.sign({ sub: 'u', roles: [], sid: 's' });
    try {
      svc.verify(token);
      fail('expected error');
    } catch (err) {
      expect((err as TokenError).reason).toBe('expired');
    }
  });

  it('publishes a JWKS', () => {
    const jwks = svc.jwks();
    expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', kid: 'test' });
  });
});

describe('service tokens', () => {
  it('verifies with the shared secret only', () => {
    const token = signServiceToken('secret', 'order-service', { tenantId: 't1' });
    expect(verifyServiceToken('secret', token)).toMatchObject({
      sub: 'order-service',
      typ: 'service',
    });
    expect(() => verifyServiceToken('wrong', token)).toThrow(TokenError);
  });
});

describe('helpers', () => {
  it('extracts bearer tokens', () => {
    expect(extractBearer('Bearer abc')).toBe('abc');
    expect(extractBearer('Basic abc')).toBeNull();
    expect(extractBearer(undefined)).toBeNull();
  });
  it('compares in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
