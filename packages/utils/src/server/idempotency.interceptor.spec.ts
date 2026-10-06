import { CallHandler, ConflictException, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

class FakeRedis {
  store = new Map<string, string>();
  async get(k: string) {
    return this.store.get(k) ?? null;
  }
  async set(k: string, v: string, ..._args: unknown[]) {
    const nx = _args.includes('NX');
    if (nx && this.store.has(k)) return null;
    this.store.set(k, v);
    return 'OK';
  }
  async del(k: string) {
    this.store.delete(k);
    return 1;
  }
}

function ctx(body: unknown, key = 'abc') {
  const res: any = { statusCode: 201, status: jest.fn().mockReturnThis(), setHeader: jest.fn() };
  const req = { method: 'POST', headers: { 'idempotency-key': key }, body, route: { path: '/orders' }, user: { sub: 'u1' } };
  return {
    res,
    ctx: { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as unknown as ExecutionContext,
  };
}

describe('IdempotencyInterceptor', () => {
  it('replays the first response for a retried request', async () => {
    const redis = new FakeRedis();
    const interceptor = new IdempotencyInterceptor(redis as never);
    const handler: CallHandler = { handle: jest.fn(() => of({ id: 'order_1' })) };

    const first = await lastValueFrom(interceptor.intercept(ctx({ a: 1 }).ctx, handler));
    await new Promise((r) => setImmediate(r));
    const retry = ctx({ a: 1 });
    const second = await lastValueFrom(interceptor.intercept(retry.ctx, handler));

    expect(first).toEqual({ id: 'order_1' });
    expect(second).toEqual({ id: 'order_1' });
    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(retry.res.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });

  it('rejects a reused key with a different payload', async () => {
    const redis = new FakeRedis();
    const interceptor = new IdempotencyInterceptor(redis as never);
    const handler: CallHandler = { handle: () => of({ ok: true }) };
    await lastValueFrom(interceptor.intercept(ctx({ a: 1 }).ctx, handler));
    await new Promise((r) => setImmediate(r));
    await expect(lastValueFrom(interceptor.intercept(ctx({ a: 2 }).ctx, handler))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
