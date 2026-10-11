import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma, TenantMember } from '@foodgrid/database';
import type { TenantRole } from '@foodgrid/types';
import { permissionDeniedMessage, Permissions, TENANT_ROLE_PERMISSIONS } from '@foodgrid/auth';
import {
  badRequest,
  conflict,
  enumLabel,
  forbidden,
  gstinStateCode,
  isValidGstin,
  notFound,
} from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
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

/** Tenant fields every member may see; PAN, KYC documents and review data are left out. */
export const PUBLIC_TENANT_FIELDS = {
  id: true,
  type: true,
  status: true,
  name: true,
  slug: true,
  legalName: true,
  gstin: true,
  fssaiLicense: true,
  email: true,
  phone: true,
  addressLine1: true,
  city: true,
  state: true,
  stateCode: true,
  pincode: true,
  lat: true,
  lng: true,
  logoUrl: true,
  settings: true,
} satisfies Prisma.TenantSelect;

/** OWNER outranks MANAGER, who outranks every other role. */
const roleRank = (role: TenantRole) => (role === 'OWNER' ? 3 : role === 'MANAGER' ? 2 : 1);

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    private readonly internal: InternalHttpService,
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
      include: { tenant: { select: PUBLIC_TENANT_FIELDS } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw notFound('Tenant', tenantId);
    return tenant;
  }

  async getPublic(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: PUBLIC_TENANT_FIELDS,
    });
    if (!tenant) throw notFound('Tenant', tenantId);
    return tenant;
  }

  async update(tenantId: string, actorId: string, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.update({ where: { id: tenantId }, data: dto });
    await this.audit.record({
      actorId,
      tenantId,
      action: 'tenant.update',
      entityType: 'Tenant',
      entityId: tenantId,
      changes: dto,
    });
    return tenant;
  }

  /**
   * Upload (or re-upload after rejection) KYC documents and re-enter the approval queue.
   * Changed identifiers (GSTIN, PAN, FSSAI, legal name) wait in the approval request and are
   * applied only when it is approved.
   */
  async submitKyc(tenantId: string, actorId: string, dto: SubmitKycDto) {
    const { documents, ...changes } = dto;
    if (changes.gstin && !isValidGstin(changes.gstin))
      throw badRequest('GSTIN checksum is invalid', 'INVALID_GSTIN');
    if (changes.gstin) changes.stateCode ??= gstinStateCode(changes.gstin);
    const { status } = await this.get(tenantId);
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        kycDocuments: documents as unknown as Prisma.InputJsonValue,
        // an application not yet approved goes back under review, without the last notes
        ...(status === 'REJECTED' || status === 'PENDING_APPROVAL'
          ? { status: 'PENDING_APPROVAL', rejectionReason: null }
          : {}),
      },
    });
    await this.approvals.create({
      entityType: 'TENANT',
      entityId: tenant.id,
      tenantId: tenant.id,
      title: `KYC resubmission: ${tenant.name}`,
      submittedBy: actorId,
      documents: documents as unknown as Record<string, unknown>[],
      metadata: {
        type: tenant.type,
        city: tenant.city,
        gstin: tenant.gstin,
        ...(Object.keys(changes).length ? { changes } : {}),
      },
    });
    return tenant;
  }

  // ─── staff ────────────────────────────────────────────────────────────────
  // Access tokens can be up to 15 minutes stale, so staff management re-reads the caller's
  // membership instead of trusting tenantRole / outletIds claims.
  private async actor(tenantId: string, userId: string) {
    const actor = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (actor?.status !== 'ACTIVE')
      throw forbidden('You are no longer a member of this business', 'NOT_A_MEMBER');
    if (!TENANT_ROLE_PERMISSIONS[actor.role].includes(Permissions.StaffManage))
      throw forbidden(permissionDeniedMessage([Permissions.StaffManage]), 'PERMISSION_DENIED');
    return actor;
  }

  /** Only an OWNER may grant, or act on members holding, a role at or above the caller's own. */
  private assertRole(actor: TenantMember, role: TenantRole) {
    if (actor.role !== 'OWNER' && roleRank(role) >= roleRank(actor.role))
      throw forbidden(`Only an owner can manage the ${enumLabel(role)} role`, 'ROLE_NOT_ALLOWED');
  }

  /** Outlet-restricted callers may only manage, and hand out, outlets they have themselves. */
  private assertOutlets(actor: TenantMember, outletIds: string[]) {
    if (
      actor.outletIds.length &&
      (!outletIds.length || outletIds.some((id) => !actor.outletIds.includes(id)))
    )
      throw forbidden('You can only manage staff at your own outlets', 'OUTLET_NOT_ALLOWED');
  }

  async members(tenantId: string, actorId: string) {
    await this.actor(tenantId, actorId);
    const rows = await this.prisma.tenantMember.findMany({
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
    // Profiles are shown only for people who accepted the invite; others show the phone entered.
    return rows.map((m) =>
      m.status === 'ACTIVE'
        ? m
        : {
            ...m,
            user: {
              id: m.user.id,
              phone: m.user.phone,
              name: null,
              email: null,
              avatarUrl: null,
              lastLoginAt: null,
            },
          },
    );
  }

  /** Invites by phone. The membership stays INVITED until the invitee accepts it themselves. */
  async invite(tenantId: string, actorId: string, dto: InviteMemberDto) {
    const actor = await this.actor(tenantId, actorId);
    const outletIds = dto.outletIds ?? [];
    this.assertRole(actor, dto.role);
    this.assertOutlets(actor, outletIds);
    const phone = normalizePhone(dto.phone);
    // No name: the inviter must not pick the profile of an account someone else will own.
    const user =
      (await this.prisma.user.findUnique({ where: { phone } })) ??
      (await this.prisma.user.create({ data: { phone, roles: ['CUSTOMER'] } }));
    if (user.id === actorId) throw forbidden('You cannot invite yourself', 'SELF_INVITE');

    const existing = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (existing?.status === 'ACTIVE') throw conflict('User is already a member', 'ALREADY_MEMBER');

    const invite = { role: dto.role, outletIds, title: dto.title, invitedBy: actorId };
    const member = await this.prisma.tenantMember.upsert({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      create: { ...invite, tenantId, userId: user.id, status: 'INVITED' },
      update: { ...invite, status: 'INVITED' },
    });
    await this.audit.record({
      actorId,
      tenantId,
      action: 'member.invite',
      entityType: 'TenantMember',
      entityId: member.id,
      changes: { role: dto.role, outletIds },
    });
    return member;
  }

  /** Invitations waiting for the signed-in user. */
  invites(userId: string) {
    return this.prisma.tenantMember.findMany({
      where: { userId, status: 'INVITED' },
      include: {
        tenant: { select: { id: true, name: true, type: true, city: true, logoUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptInvite(userId: string, memberId: string) {
    const res = await this.prisma.tenantMember.updateMany({
      where: { id: memberId, userId, status: 'INVITED' },
      data: { status: 'ACTIVE' },
    });
    if (!res.count) throw notFound('Invite', memberId);
    const member = await this.prisma.tenantMember.findUniqueOrThrow({ where: { id: memberId } });
    await this.audit.record({
      actorId: userId,
      tenantId: member.tenantId,
      action: 'member.accept',
      entityType: 'TenantMember',
      entityId: memberId,
    });
    return member;
  }

  async updateMember(tenantId: string, memberId: string, actorId: string, dto: UpdateMemberDto) {
    const actor = await this.actor(tenantId, actorId);
    const member = await this.prisma.tenantMember.findFirst({ where: { id: memberId, tenantId } });
    if (!member) throw notFound('Member', memberId);
    if (dto.role !== undefined || dto.outletIds !== undefined || dto.status !== undefined) {
      if (member.userId === actorId)
        throw forbidden('You cannot change your own role, outlets or access', 'SELF_UPDATE');
      this.assertRole(actor, member.role);
      if (dto.role) this.assertRole(actor, dto.role);
      this.assertOutlets(actor, member.outletIds);
      if (dto.outletIds) this.assertOutlets(actor, dto.outletIds);
    }
    const demotingOwner =
      member.role === 'OWNER' && ((dto.role && dto.role !== 'OWNER') || dto.status === 'REVOKED');
    if (demotingOwner) await this.assertAnotherOwner(tenantId, memberId);

    // Restoring someone who is not active re-sends the invite; it never skips their consent.
    const status = dto.status === 'ACTIVE' && member.status !== 'ACTIVE' ? 'INVITED' : dto.status;
    const updated = await this.prisma.tenantMember.update({
      where: { id: memberId },
      data: { ...dto, status },
    });
    if (
      member.status === 'ACTIVE' &&
      (updated.status !== member.status ||
        updated.role !== member.role ||
        updated.outletIds.join() !== member.outletIds.join())
    )
      await this.endSessions(member.userId);
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

  /** Outstanding access tokens still carry the old role / outlets; end them so the change applies now. */
  private async endSessions(userId: string) {
    // ponytail: revokes every session of the user (no tenant-scoped revoke in auth-service yet).
    await this.internal
      .post('auth', 'internal/auth/revoke-user-sessions', { userId })
      .catch((err: Error) =>
        this.logger.error(`Could not revoke sessions for ${userId}: ${err.message}`),
      );
  }

  private async assertAnotherOwner(tenantId: string, excludingMemberId: string) {
    const owners = await this.prisma.tenantMember.count({
      where: { tenantId, role: 'OWNER', status: 'ACTIVE', NOT: { id: excludingMemberId } },
    });
    if (!owners) throw conflict('A business must keep at least one owner', 'LAST_OWNER');
  }
}
