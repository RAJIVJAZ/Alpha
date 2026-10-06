import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { conflict, notFound } from '@foodgrid/utils';

/** Customer loyalty membership (free delivery + extra discounts). */
@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  plans() {
    return this.prisma.membershipPlan.findMany({ where: { isActive: true }, orderBy: { price: 'asc' } });
  }

  async mine(userId: string) {
    const active = await this.prisma.customerMembership.findFirst({
      where: { customerId: userId, status: 'ACTIVE', endsAt: { gt: new Date() } },
      include: { plan: true },
      orderBy: { endsAt: 'desc' },
    });
    const history = await this.prisma.customerMembership.findMany({
      where: { customerId: userId },
      include: { plan: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return { active, history };
  }

  /** Creates a pending membership; it activates on payment.captured (purpose MEMBERSHIP). */
  async purchase(userId: string, planId: string) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw notFound('Membership plan', planId);
    const pending = await this.prisma.customerMembership.findFirst({ where: { customerId: userId, status: 'PENDING_PAYMENT' } });
    if (pending) {
      if (pending.planId === planId) return pending;
      await this.prisma.customerMembership.update({ where: { id: pending.id }, data: { status: 'CANCELLED' } });
    }
    const now = new Date();
    return this.prisma.customerMembership.create({
      data: { customerId: userId, planId, startsAt: now, endsAt: new Date(now.getTime() + plan.durationDays * 86_400_000) },
    });
  }

  /** Activation extends an existing active membership instead of overlapping it. */
  async activate(membershipId: string, paymentId: string) {
    const m = await this.prisma.customerMembership.findUnique({ where: { id: membershipId }, include: { plan: true } });
    if (!m) throw notFound('Membership', membershipId);
    if (m.status === 'ACTIVE') return m;
    if (m.status !== 'PENDING_PAYMENT') throw conflict('Membership is not awaiting payment', 'MEMBERSHIP_STATE');
    const current = await this.prisma.customerMembership.findFirst({
      where: { customerId: m.customerId, status: 'ACTIVE', endsAt: { gt: new Date() } },
      orderBy: { endsAt: 'desc' },
    });
    const startsAt = current ? current.endsAt : new Date();
    return this.prisma.customerMembership.update({
      where: { id: membershipId },
      data: { status: 'ACTIVE', paymentId, startsAt, endsAt: new Date(startsAt.getTime() + m.plan.durationDays * 86_400_000) },
    });
  }
}
