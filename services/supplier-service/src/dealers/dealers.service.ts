import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma } from '@foodgrid/database';
import { badRequest, notFound, round2 } from '@foodgrid/utils';
import { DealerDto, TerritoryDto, UpdateDealerDto, UpdateTerritoryDto } from './dto/dealer.dto';

/** Wholesaler dealer network & territory management. */
@Injectable()
export class DealersService {
  constructor(private readonly prisma: PrismaService) {}

  async territories(tenantId: string) {
    const territories = await this.prisma.forTenant(tenantId).territory.findMany({
      include: { _count: { select: { dealers: true } } },
      orderBy: { name: 'asc' },
    });
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const sales = await this.prisma.$queryRaw<{ territoryId: string; gmv: unknown }[]>`
      SELECT d."territoryId", SUM(o.total) AS gmv
      FROM "marketplace"."B2bOrder" o
      JOIN "marketplace"."Dealer" d ON d."dealerTenantId" = o."buyerTenantId" AND d."tenantId" = o."sellerTenantId"
      WHERE o."sellerTenantId" = ${tenantId} AND o.status = 'DELIVERED' AND o."deliveredAt" >= ${monthStart}
      GROUP BY d."territoryId"`;
    const byTerritory = new Map(sales.map((s) => [s.territoryId, Number(s.gmv)]));
    return territories.map((t) => {
      const mtd = round2(byTerritory.get(t.id) ?? 0);
      return { ...t, monthToDateSales: mtd, targetAchievementPct: t.monthlyTarget ? round2((mtd / Number(t.monthlyTarget)) * 100) : null };
    });
  }
  createTerritory(tenantId: string, dto: TerritoryDto) {
    return this.prisma.forTenant(tenantId).territory.create({ data: { ...dto, tenantId } });
  }
  async updateTerritory(tenantId: string, id: string, dto: UpdateTerritoryDto) {
    if (!(await this.prisma.forTenant(tenantId).territory.findUnique({ where: { id } }))) throw notFound('Territory', id);
    return this.prisma.territory.update({ where: { id }, data: dto });
  }

  dealers(tenantId: string, q: { territoryId?: string; status?: string; q?: string }) {
    return this.prisma.forTenant(tenantId).dealer.findMany({
      where: {
        territoryId: q.territoryId,
        status: q.status as Prisma.DealerWhereInput['status'],
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { city: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      include: { territory: { select: { name: true } } },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    });
  }

  async createDealer(tenantId: string, dto: DealerDto) {
    if (dto.territoryId && !(await this.prisma.forTenant(tenantId).territory.findUnique({ where: { id: dto.territoryId } }))) {
      throw badRequest('Unknown territory', 'INVALID_TERRITORY');
    }
    return this.prisma.forTenant(tenantId).dealer.create({
      data: { ...dto, tenantId, onboardedAt: dto.status === 'ACTIVE' ? new Date() : null },
    });
  }

  async updateDealer(tenantId: string, id: string, dto: UpdateDealerDto) {
    const dealer = await this.prisma.forTenant(tenantId).dealer.findUnique({ where: { id } });
    if (!dealer) throw notFound('Dealer', id);
    return this.prisma.dealer.update({
      where: { id },
      data: { ...dto, ...(dto.status === 'ACTIVE' && !dealer.onboardedAt ? { onboardedAt: new Date() } : {}) },
    });
  }

  async dealerOrders(tenantId: string, id: string) {
    const dealer = await this.prisma.forTenant(tenantId).dealer.findUnique({ where: { id } });
    if (!dealer) throw notFound('Dealer', id);
    if (!dealer.dealerTenantId) return [];
    return this.prisma.b2bOrder.findMany({
      where: { sellerTenantId: tenantId, buyerTenantId: dealer.dealerTenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Dealer terms applied when a known dealer buys from this seller. */
  async termsFor(sellerTenantId: string, buyerTenantId: string) {
    return this.prisma.dealer.findFirst({ where: { tenantId: sellerTenantId, dealerTenantId: buyerTenantId, status: 'ACTIVE' } });
  }
}
