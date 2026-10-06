import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { istMonthStart, round2, sumMoney } from '@foodgrid/utils';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string) {
    const db = this.prisma.forTenant(tenantId);
    const monthStart = istMonthStart();
    const [alerts, byStatus, monthPos, quotes] = await Promise.all([
      db.reorderAlert.groupBy({ by: ['severity'], where: { status: 'OPEN' }, _count: { _all: true } }),
      db.purchaseOrder.groupBy({ by: ['status'], _count: { _all: true }, _sum: { total: true } }),
      db.purchaseOrder.findMany({ where: { createdAt: { gte: monthStart }, status: { notIn: ['CANCELLED', 'REJECTED', 'DRAFT'] } }, select: { total: true, source: true } }),
      db.supplierQuote.findMany({ where: { generatedAt: { gte: monthStart }, rank: 1 }, select: { landedCost: true, ingredientId: true, generatedAt: true } }),
    ]);
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const spend = sumMoney(monthPos.map((p) => p.total.toString()));
    return {
      openAlerts: Object.fromEntries(alerts.map((a) => [a.severity, a._count._all])),
      pendingApproval: count('PENDING_APPROVAL'),
      awaitingSupplier: count('SENT_TO_SUPPLIER'),
      inTransit: count('DISPATCHED') + count('IN_TRANSIT'),
      deliveredNotReceived: count('DELIVERED'),
      monthToDateSpend: spend,
      autoPoShare: monthPos.length ? round2((monthPos.filter((p) => p.source === 'AUTO_REORDER').length / monthPos.length) * 100) : 0,
      comparisonsRun: quotes.length,
    };
  }
}
