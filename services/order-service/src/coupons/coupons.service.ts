import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import type { AccessTokenClaims } from '@foodgrid/types';
import { badRequest, notFound } from '@foodgrid/utils';
import { checkCouponEligibility, toCouponRecord } from '../domain/coupons';
import { CouponDto, PlatformCouponDto, UpdateCouponDto } from './dto/coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  private validate(dto: Partial<CouponDto>) {
    if (dto.type === 'PERCENT' && dto.value !== undefined && dto.value > 100)
      throw badRequest('Percent cannot exceed 100', 'INVALID_COUPON');
    if (dto.validFrom && dto.validTo && new Date(dto.validTo) <= new Date(dto.validFrom)) {
      throw badRequest('validTo must be after validFrom', 'INVALID_COUPON');
    }
  }

  merchantList(user: AccessTokenClaims) {
    return this.prisma.coupon.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  merchantCreate(user: AccessTokenClaims, dto: CouponDto) {
    this.validate(dto);
    return this.prisma.coupon.create({
      data: {
        ...dto,
        code: dto.code.toUpperCase(),
        tenantId: user.tenantId!,
        fundedBy: 'MERCHANT',
      },
    });
  }

  async merchantUpdate(user: AccessTokenClaims, id: string, dto: UpdateCouponDto) {
    this.validate(dto);
    const coupon = await this.prisma.coupon.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!coupon) throw notFound('Coupon', id);
    return this.prisma.coupon.update({
      where: { id },
      data: { ...dto, code: dto.code?.toUpperCase() },
    });
  }

  adminList(q: { active?: boolean }) {
    return this.prisma.coupon.findMany({
      where: q.active === undefined ? {} : { isActive: q.active },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  adminCreate(dto: PlatformCouponDto) {
    this.validate(dto);
    return this.prisma.coupon.create({
      data: { ...dto, code: dto.code.toUpperCase(), fundedBy: dto.fundedBy ?? 'PLATFORM' },
    });
  }

  adminUpdate(id: string, dto: UpdateCouponDto) {
    this.validate(dto);
    return this.prisma.coupon.update({
      where: { id },
      data: { ...dto, code: dto.code?.toUpperCase() },
    });
  }

  /** Coupons a customer can see for an outlet, with eligibility hints. */
  /** Without an outlet, lists platform-wide offers (the customer "Offers" page). */
  async available(userId: string, outletId?: string) {
    const outlet = outletId
      ? await this.prisma.outlet.findUnique({ where: { id: outletId } })
      : null;
    if (outletId && !outlet) throw notFound('Outlet', outletId);
    const now = new Date();
    const where: Prisma.CouponWhereInput = {
      isActive: true,
      validFrom: { lte: now },
      validTo: { gte: now },
      OR: outlet ? [{ tenantId: null }, { tenantId: outlet.tenantId }] : [{ tenantId: null }],
    };
    const [coupons, completed, member, redemptions] = await Promise.all([
      this.prisma.coupon.findMany({ where, orderBy: { value: 'desc' }, take: 50 }),
      this.prisma.order.count({
        where: { customerId: userId, status: { in: ['DELIVERED', 'COMPLETED'] } },
      }),
      this.prisma.customerMembership.count({
        where: { customerId: userId, status: 'ACTIVE', endsAt: { gt: now } },
      }),
      this.prisma.couponRedemption.groupBy({
        by: ['couponId'],
        where: { userId },
        _count: { _all: true },
      }),
    ]);
    const used = new Map(redemptions.map((r) => [r.couponId, r._count._all]));
    return coupons
      .map((c) => {
        const check = checkCouponEligibility(
          toCouponRecord(c),
          // platform offers carry no outlet restriction worth checking without an outlet
          {
            now,
            outletId: outletId ?? c.outletIds[0] ?? '',
            tenantId: outlet?.tenantId ?? '',
            isFirstOrder: completed === 0,
            isMember: member > 0,
            userRedemptions: used.get(c.id) ?? 0,
          },
        );
        return {
          code: c.code,
          title: c.title,
          description: c.description,
          type: c.type,
          value: c.value,
          maxDiscount: c.maxDiscount,
          minOrderValue: c.minOrderValue,
          validTo: c.validTo,
          eligible: check.valid,
          reason: check.valid ? null : check.reason,
        };
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible));
  }
}
