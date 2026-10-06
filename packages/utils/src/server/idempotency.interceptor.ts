import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { from, Observable, of, switchMap, tap, catchError, throwError } from 'rxjs';
import { REDIS } from './redis.module';

const TTL_SECONDS = 24 * 3600;
const LOCK_SECONDS = 60;

/**
 * Replays the stored response for retried POST/PUT/PATCH requests carrying
 * the same `Idempotency-Key` (per user + route). Concurrent duplicates get
 * 409 while the first request is still in flight. A different body with a
 * reused key is rejected with 422.
 *
 * Apply with @UseInterceptors(IdempotencyInterceptor) on money-moving routes.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: { sub: string } }>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const key = req.headers['idempotency-key'];
    if (!key || typeof key !== 'string' || !['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next.handle();
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
    const route = (req.route?.path as string | undefined) ?? req.path;
    const redisKey = `idem:${req.user?.sub ?? 'anon'}:${req.method}:${route}:${key}`;

    return from(this.redis.get(redisKey)).pipe(
      switchMap((cached) => {
        if (cached) {
          const stored = JSON.parse(cached) as { state: string; fingerprint: string; status?: number; body?: unknown };
          if (stored.fingerprint !== fingerprint) {
            return throwError(
              () => new ConflictException({ message: 'Idempotency-Key reused with a different payload', code: 'IDEMPOTENCY_MISMATCH' }),
            );
          }
          if (stored.state === 'processing') {
            return throwError(
              () => new ConflictException({ message: 'Request already in progress', code: 'IDEMPOTENCY_IN_PROGRESS' }),
            );
          }
          res.status(stored.status ?? 200);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(stored.body);
        }
        return from(
          this.redis.set(redisKey, JSON.stringify({ state: 'processing', fingerprint }), 'EX', LOCK_SECONDS, 'NX'),
        ).pipe(
          switchMap((acquired) => {
            if (!acquired) {
              return throwError(
                () => new ConflictException({ message: 'Request already in progress', code: 'IDEMPOTENCY_IN_PROGRESS' }),
              );
            }
            return next.handle().pipe(
              tap((body) => {
                void this.redis.set(
                  redisKey,
                  JSON.stringify({ state: 'done', fingerprint, status: res.statusCode, body }),
                  'EX',
                  TTL_SECONDS,
                );
              }),
              catchError((err) => {
                void this.redis.del(redisKey);
                return throwError(() => err);
              }),
            );
          }),
        );
      }),
    );
  }
}
