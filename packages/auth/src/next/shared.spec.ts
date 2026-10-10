import { apiUrl } from './shared';

describe('apiUrl', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  const unset = () => {
    delete process.env.API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.VERCEL;
  };

  it('sends everything through the gateway when API_URL is set', () => {
    process.env.API_URL = 'http://gateway:8080/api/v1/';
    process.env.ORDER_SERVICE_URL = 'https://order.internal';
    expect(apiUrl('orders/1?x=y')).toBe('http://gateway:8080/api/v1/orders/1?x=y');
    expect(apiUrl('/.well-known/jwks.json')).toBe('http://gateway:8080/.well-known/jwks.json');
  });

  it('calls the bound service that owns the path (longest prefix wins)', () => {
    unset();
    process.env.ORDER_SERVICE_URL = 'https://order.internal';
    process.env.PAYMENT_SERVICE_URL = 'https://payment.internal/base';
    process.env.AUTH_SERVICE_URL = 'https://auth.internal';
    expect(apiUrl('orders/1?x=y')).toBe('https://order.internal/api/v1/orders/1?x=y');
    expect(apiUrl('admin/settlements')).toBe(
      'https://payment.internal/base/api/v1/admin/settlements',
    );
    expect(apiUrl('/.well-known/jwks.json')).toBe('https://auth.internal/.well-known/jwks.json');
  });

  it('uses the public rewrites on Vercel where bindings do not resolve (middleware)', () => {
    unset();
    delete process.env.AUTH_SERVICE_URL;
    process.env.VERCEL = '1';
    expect(apiUrl('auth/refresh', 'https://partner.foodgrid.in')).toBe(
      'https://partner.foodgrid.in/api/v1/auth/refresh',
    );
  });

  it('falls back to the local gateway', () => {
    unset();
    delete process.env.AUTH_SERVICE_URL;
    expect(apiUrl('auth/refresh', 'http://localhost:3002')).toBe(
      'http://localhost:8080/api/v1/auth/refresh',
    );
  });
});
