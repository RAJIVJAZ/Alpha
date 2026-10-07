import { Injectable, Logger } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import { EventTypes, TenantStatusChangedEvent } from '@foodgrid/types';
import { conflict, normalizePage, notFound, paginate } from '@foodgrid/utils';
import { InternalHttpService, OutboxService } from '@foodgrid/utils/server';
import { AuditService } from '../common/audit.service';
import {
  CreateStaffDto,
  ListAuditDto,
  ListTenantsDto,
  ListUsersDto,
  UpdateTenantAdminDto,
  UpdateUserRolesDto,
  UpdateUserStatusDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly internal: InternalHttpService,
  ) {}

  async listUsers(q: ListUsersDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.UserWhereInput = {
      status: q.status,
      ...(q.role ? { roles: { has: q.role } } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { phone: { contains: q.q } },
              { email: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          roles: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        roles: true,
        status: true,
        avatarUrl: true,
        referralCode: true,
        referredBy: true,
        createdAt: true,
        lastLoginAt: true,
        memberships: {
          include: { tenant: { select: { id: true, name: true, type: true, status: true } } },
        },
        addresses: true,
      },
    });
    if (!user) throw notFound('User', id);
    return user;
  }

  async setUserStatus(id: string, actorId: string, dto: UpdateUserStatusDto) {
    const user = await this.prisma.user.update({ where: { id }, data: { status: dto.status } });
    if (dto.status === 'BLOCKED') {
      await this.internal
        .post('auth', 'internal/auth/revoke-user-sessions', { userId: id })
        .catch((err: Error) =>
          this.logger.error(`Could not revoke sessions for ${id}: ${err.message}`),
        );
    }
    await this.audit.record({
      actorId,
      action: `user.${dto.status.toLowerCase()}`,
      entityType: 'User',
      entityId: id,
      changes: dto,
    });
    return { id: user.id, status: user.status };
  }

  async setUserRoles(id: string, actorId: string, dto: UpdateUserRolesDto) {
    const roles = [...new Set(dto.roles)];
    const user = await this.prisma.user.update({ where: { id }, data: { roles: { set: roles } } });
    await this.audit.record({
      actorId,
      action: 'user.roles',
      entityType: 'User',
      entityId: id,
      changes: { roles },
    });
    return { id: user.id, roles: user.roles };
  }

  async createStaff(actorId: string, dto: CreateStaffDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } }))
      throw conflict('Email already registered', 'EMAIL_TAKEN');
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, 12),
        roles: ['CUSTOMER', ...dto.roles],
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true, name: true, roles: true },
    });
    await this.audit.record({
      actorId,
      action: 'staff.create',
      entityType: 'User',
      entityId: user.id,
      changes: { roles: dto.roles },
    });
    return user;
  }

  async listTenants(q: ListTenantsDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.TenantWhereInput = {
      type: q.type,
      status: q.status,
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { gstin: { contains: q.q.toUpperCase() } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, phone: true, email: true } } },
        },
      },
    });
    if (!tenant) throw notFound('Tenant', id);
    return tenant;
  }

  async updateTenant(id: string, actorId: string, dto: UpdateTenantAdminDto) {
    const tenant = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id },
        data: { status: dto.status, commissionRate: dto.commissionRate },
      });
      if (dto.status) {
        await this.outbox.enqueue<TenantStatusChangedEvent>(tx, {
          stream: 'identity',
          type: EventTypes.TenantStatusChanged,
          aggregateType: 'Tenant',
          aggregateId: id,
          tenantId: id,
          data: {
            tenantId: id,
            tenantType: updated.type,
            status: updated.status,
            reason: dto.reason ?? null,
          },
        });
      }
      return updated;
    });
    await this.audit.record({
      actorId,
      tenantId: id,
      action: 'tenant.admin_update',
      entityType: 'Tenant',
      entityId: id,
      changes: dto,
    });
    return tenant;
  }

  async auditLogs(q: ListAuditDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.AuditLogWhereInput = {
      entityType: q.entityType,
      entityId: q.entityId,
      tenantId: q.tenantId,
      actorId: q.actorId,
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  async stats() {
    const [usersByRole, tenantsByType, pendingApprovals, totalUsers, blockedUsers] =
      await Promise.all([
        this.prisma.$queryRaw<{ role: string; count: bigint }[]>`
        SELECT unnest(roles)::text AS role, COUNT(*) AS count FROM "identity"."User" GROUP BY 1`,
        this.prisma.tenant.groupBy({ by: ['type', 'status'], _count: { _all: true } }),
        this.prisma.approvalRequest.groupBy({
          by: ['entityType'],
          where: { status: 'PENDING' },
          _count: { _all: true },
        }),
        this.prisma.user.count(),
        this.prisma.user.count({ where: { status: 'BLOCKED' } }),
      ]);
    return {
      totalUsers,
      blockedUsers,
      usersByRole: Object.fromEntries(usersByRole.map((r) => [r.role, Number(r.count)])),
      tenants: tenantsByType.map((t) => ({ type: t.type, status: t.status, count: t._count._all })),
      pendingApprovals: Object.fromEntries(
        pendingApprovals.map((a) => [a.entityType, a._count._all]),
      ),
    };
  }
}
