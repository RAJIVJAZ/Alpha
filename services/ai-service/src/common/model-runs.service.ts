import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { AiModelKind, Prisma } from '@foodgrid/database';
import { businessCounter } from '@foodgrid/utils/server';

const inferences = businessCounter('ai_inferences_total', 'AI model invocations', ['kind', 'outcome']);

/** Times a model invocation and records it in ai.AiModelRun (audit + monitoring). */
@Injectable()
export class ModelRunsService {
  private readonly logger = new Logger(ModelRunsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track<T>(kind: AiModelKind, tenantId: string | null | undefined, fn: () => T | Promise<T>, metrics?: (r: T) => Record<string, unknown>) {
    const started = Date.now();
    try {
      const result = await fn();
      inferences.inc({ kind, outcome: 'success' });
      void this.prisma.aiModelRun
        .create({
          data: {
            kind,
            tenantId: tenantId ?? null,
            durationMs: Date.now() - started,
            metrics: metrics ? (JSON.parse(JSON.stringify(metrics(result))) as Prisma.InputJsonValue) : undefined,
          },
        })
        .catch((err: Error) => this.logger.warn(`model run not recorded: ${err.message}`));
      return result;
    } catch (err) {
      inferences.inc({ kind, outcome: 'error' });
      void this.prisma.aiModelRun
        .create({ data: { kind, tenantId: tenantId ?? null, durationMs: Date.now() - started, success: false, error: (err as Error).message } })
        .catch(() => undefined);
      throw err;
    }
  }
}
