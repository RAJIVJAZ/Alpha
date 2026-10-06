import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(entry: {
    actorId?: string;
    tenantId?: string | null;
    action: string;
    entityType: string;
    entityId?: string;
    changes?: unknown;
    ip?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        ...entry,
        changes: entry.changes === undefined ? undefined : (JSON.parse(JSON.stringify(entry.changes)) as Prisma.InputJsonValue),
      },
    });
  }
}
