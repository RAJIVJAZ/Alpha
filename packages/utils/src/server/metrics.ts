import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import { Observable, tap } from 'rxjs';

export const metricsRegistry = new Registry();
let initialised = false;

export function initMetrics(serviceName: string) {
  if (initialised) return;
  initialised = true;
  metricsRegistry.setDefaultLabels({ service: serviceName });
  collectDefaultMetrics({ register: metricsRegistry });
}

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

export const eventsProcessed = new Counter({
  name: 'domain_events_processed_total',
  help: 'Domain events handled by consumers',
  labelNames: ['type', 'outcome'],
  registers: [metricsRegistry],
});

export const eventsPublished = new Counter({
  name: 'domain_events_published_total',
  help: 'Domain events relayed from the outbox',
  labelNames: ['type'],
  registers: [metricsRegistry],
});

/** Business counters a service can increment (orders placed, payments captured ...). */
export function businessCounter(name: string, help: string, labelNames: string[] = []) {
  const existing = metricsRegistry.getSingleMetric(name);
  if (existing) return existing as Counter<string>;
  return new Counter({ name, help, labelNames, registers: [metricsRegistry] });
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const end = httpDuration.startTimer({ method: req.method });
    const route = (req.route?.path as string | undefined) ?? 'unmatched';
    return next.handle().pipe(
      tap({
        next: () => end({ route, status: String(res.statusCode) }),
        error: (err: { status?: number }) => end({ route, status: String(err?.status ?? 500) }),
      }),
    );
  }
}
