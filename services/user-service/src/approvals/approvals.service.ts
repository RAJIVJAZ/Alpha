import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import { ApprovalDecidedEvent, EventTypes, TenantStatusChangedEvent } from '@foodgrid/types';
import { conflict, normalizePage, notFound, paginate } from '@foodgrid/utils';
import { OutboxService } from '@foodgrid/utils/server';
import { AuditService } from '../common/audit.service';
import { ApprovalDecisionDto, CreateApprovalDto, ListApprovalsDto } from './dto/approval.dto';

/**
 * Central onboarding approval queue. Owning services submit requests
 * (restaurants, riders, products, ad campaigns); admins decide here and the
 * decision is broadcast as `identity.approval.decided`.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateApprovalDto) {
    const open = await this.prisma.approvalRequest.findFirst({
      where: { entityType: dto.entityType, entityId: dto.entityId, status: { in: ['PENDING', 'CHANGES_REQUESTED'] } },
    });
    const data = {
      title: dto.title,
      tenantId: dto.tenantId,
      submittedBy: dto.submittedBy,
      documents: (dto.documents ?? []) as Prisma.InputJsonValue,
      metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
    };
    if (open) {
      return this.prisma.approvalRequest.update({ where: { id: open.id }, data: { ...data, status: 'PENDING' } });
    }
    return this.prisma.approvalRequest.create({ data: { ...data, entityType: dto.entityType, entityId: dto.entityId } });
  }

  async list(q: ListApprovalsDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.ApprovalRequestWhereInput = {
      entityType: q.entityType,
      status: q.status ?? 'PENDING',
    };
    const [rows, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take }),
      this.prisma.approvalRequest.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  async get(id: string) {
    const approval = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) throw notFound('Approval', id);
    const tenant = approval.tenantId ? await this.prisma.tenant.findUnique({ where: { id: approval.tenantId } }) : null;
    return { ...approval, tenant };
  }

  async decide(id: string, dto: ApprovalDecisionDto, reviewerId: string) {
    const approval = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) throw notFound('Approval', id);
    if (approval.status === 'APPROVED' || approval.status === 'REJECTED') {
      throw conflict('Approval has already been decided', 'APPROVAL_DECIDED');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.approvalRequest.update({
        where: { id },
        data: { status: dto.decision, reviewedBy: reviewerId, reviewedAt: new Date(), reviewNotes: dto.notes },
      });

      if (approval.entityType === 'TENANT' && dto.decision !== 'CHANGES_REQUESTED') {
        const tenant = await tx.tenant.update({
          where: { id: approval.entityId },
          data:
            dto.decision === 'APPROVED'
              ? { status: 'ACTIVE', approvedAt: new Date(), approvedBy: reviewerId, rejectionReason: null }
              : { status: 'REJECTED', rejectionReason: dto.notes ?? 'Rejected' },
        });
        await this.outbox.enqueue<TenantStatusChangedEvent>(tx, {
          stream: 'identity',
          type: EventTypes.TenantStatusChanged,
          aggregateType: 'Tenant',
          aggregateId: tenant.id,
          tenantId: tenant.id,
          data: { tenantId: tenant.id, tenantType: tenant.type, status: tenant.status, reason: dto.notes ?? null },
        });
      }

      if (approval.entityType === 'RIDER' && dto.decision === 'APPROVED') {
        const userId = (approval.metadata as { userId?: string }).userId ?? approval.submittedBy;
        if (userId) {
          const user = await tx.user.findUnique({ where: { id: userId } });
          if (user && !user.roles.includes('RIDER')) {
            await tx.user.update({ where: { id: userId }, data: { roles: { set: [...user.roles, 'RIDER'] } } });
          }
        }
      }

      await this.outbox.enqueue<ApprovalDecidedEvent>(tx, {
        stream: 'identity',
        type: EventTypes.ApprovalDecided,
        aggregateType: 'ApprovalRequest',
        aggregateId: updated.id,
        tenantId: updated.tenantId,
        data: {
          approvalId: updated.id,
          entityType: updated.entityType,
          entityId: updated.entityId,
          tenantId: updated.tenantId,
          decision: dto.decision,
          notes: dto.notes ?? null,
          reviewedBy: reviewerId,
          submittedBy: updated.submittedBy,
        },
      });
      return updated;
    });

    await this.audit.record({
      actorId: reviewerId,
      tenantId: approval.tenantId,
      action: `approval.${dto.decision.toLowerCase()}`,
      entityType: approval.entityType,
      entityId: approval.entityId,
      changes: { notes: dto.notes },
    });
    return result;
  }
}
