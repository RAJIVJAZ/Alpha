import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import {
  badRequest,
  conflict,
  enumLabel,
  forbidden,
  gstinStateCode,
  isValidGstin,
  notFound,
} from '@foodgrid/utils';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../common/audit.service';
import { normalizePhone, slugify } from '../common/phone';
import {
  CreateTenantDto,
  InviteMemberDto,
  SubmitKycDto,
  UpdateMemberDto,
  UpdateTenantDto,
} from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
  ) {}

  /** Self-serve onboarding of a business. The creator becomes OWNER. */
  async create(userId: string, dto: CreateTenantDto) {
    if (dto.gstin && !isValidGstin(dto.gstin))
      throw badRequest('GSTIN checksum is invalid', 'INVALID_GSTIN');
    const stateCode = dto.stateCode ?? (dto.gstin ? gstinStateCode(dto.gstin) : undefined);
    const slug = `${slugify(dto.name)}-${randomBytes(3).toString('hex')}`;

    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          ...dto,
          stateCode,
          slug,
          kycDocuments: (dto.kycDocuments ?? []) as unknown as Prisma.InputJsonValue,
          members: { create: { userId, role: 'OWNER', title: 'Owner' } },
        },
      });
      return created;
    });

    await this.approvals.create({
      entityType: 'TENANT',
      entityId: tenant.id,
      tenantId: tenant.id,
      title: `${enumLabel(tenant.type)} onboarding: ${tenant.name}`,
      submittedBy: userId,
      documents: dto.kycDocuments as unknown as Record<string, unknown>[] | undefined,
      metadata: { type: tenant.type, city: tenant.city, gstin: tenant.gstin },
    });
    await this.audit.record({
      actorId: userId,
      tenantId: tenant.id,
      action: 'tenant.create',
      entityType: 'Tenant',
      entityId: tenant.id,
    });
    return tenant;
  }

  async mine(userId: string) {
    return this.prisma.tenantMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw notFound('Tenant', tenantId);
    return tenant;
  }

  async update(tenantId: string, actorId: string, dto: UpdateTenantDto) {
    if (dto.gstin && !isValidGstin(dto.gstin))
      throw badRequest('GSTIN checksum is invalid', 'INVALID_GSTIN');
    const { kycDocuments, ...rest } = dto;
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...rest,
        ...(kycDocuments ? { kycDocuments: kycDocuments as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit.record({
      actorId,
      tenantId,
      action: 'tenant.update',
      entityType: 'Tenant',
      entityId: tenantId,
      changes: rest,
    });
    return tenant;
  }

  /** Upload (or re-upload after rejection) KYC documents and re-enter the approval queue. */
  async submitKyc(tenantId: string, actorId: string, dto: SubmitKycDto) {
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        kycDocuments: dto.documents as unknown as Prisma.InputJsonValue,
        ...(['REJECTED'].includes((await this.get(tenantId)).status)
          ? { status: 'PENDING_APPROVAL' }
          : {}),
      },
    });
    await this.approvals.create({
      entityType: 'TENANT',
      entityId: tenant.id,
      tenantId: tenant.id,
      title: `KYC resubmission: ${tenant.name}`,
      submittedBy: actorId,
      documents: dto.documents as unknown as Record<string, unknown>[],
      metadata: { type: tenant.type, city: tenant.city, gstin: tenant.gstin },
    });
    return tenant;
  }

  // ─── staff ────────────────────────────────────────────────────────────────
  members(tenantId: string) {
    return this.prisma.tenantMember.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatarUrl: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async invite(tenantId: string, actorId: string, dto: InviteMemberDto) {
    const phone = normalizePhone(dto.phone);
    const user =
      (await this.prisma.user.findUnique({ where: { phone } })) ??
      (await this.prisma.user.create({ data: { phone, name: dto.name, roles: ['CUSTOMER'] } }));

    const existing = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (existing?.status === 'ACTIVE') throw conflict('User is already a member', 'ALREADY_MEMBER');

    const member = await this.prisma.tenantMember.upsert({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      create: {
        tenantId,
        userId: user.id,
        role: dto.role,
        outletIds: dto.outletIds ?? [],
        title: dto.title,
        invitedBy: actorId,
      },
      update: {
        role: dto.role,
        outletIds: dto.outletIds ?? [],
        title: dto.title,
        status: 'ACTIVE',
        invitedBy: actorId,
      },
    });
    await this.audit.record({
      actorId,
      tenantId,
      action: 'member.invite',
      entityType: 'TenantMember',
      entityId: member.id,
      changes: { role: dto.role },
    });
    return member;
  }

  async updateMember(tenantId: string, memberId: string, actorId: string, dto: UpdateMemberDto) {
    const member = await this.prisma.tenantMember.findFirst({ where: { id: memberId, tenantId } });
    if (!member) throw notFound('Member', memberId);
    const demotingOwner =
      member.role === 'OWNER' && ((dto.role && dto.role !== 'OWNER') || dto.status === 'REVOKED');
    if (demotingOwner) await this.assertAnotherOwner(tenantId, memberId);
    if (member.userId === actorId && dto.status === 'REVOKED')
      throw forbidden('You cannot remove yourself');

    const updated = await this.prisma.tenantMember.update({ where: { id: memberId }, data: dto });
    await this.audit.record({
      actorId,
      tenantId,
      action: 'member.update',
      entityType: 'TenantMember',
      entityId: memberId,
      changes: dto,
    });
    return updated;
  }

  private async assertAnotherOwner(tenantId: string, excludingMemberId: string) {
    const owners = await this.prisma.tenantMember.count({
      where: { tenantId, role: 'OWNER', status: 'ACTIVE', NOT: { id: excludingMemberId } },
    });
    if (!owners) throw conflict('A business must keep at least one owner', 'LAST_OWNER');
  }
}
