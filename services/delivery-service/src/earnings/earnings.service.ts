import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { istDate, notFound, round2, sumMoney } from '@foodgrid/utils';
import { resolveIstRange } from '@foodgrid/utils/server';

@Injectable()
export class EarningsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string, q: { from?: string; to?: string }) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId } });
    if (!rider) throw notFound('Rider profile');
    const { from, to } = resolveIstRange(q, 7);
    const rows = await this.prisma.riderEarning.findMany({ where: { riderId: rider.id, earnedAt: { gte: from, lte: to } }, orderBy: { earnedAt: 'desc' } });
    const byType: Record<string, number> = {};
    const byDay = new Map<string, { date: string; amount: number; deliveries: Set<string> }>();
    for (const r of rows) {
      byType[r.type] = sumMoney([byType[r.type] ?? 0, r.amount.toString()]);
      const d = istDate(r.earnedAt);
      const day = byDay.get(d) ?? { date: d, amount: 0, deliveries: new Set<string>() };
      day.amount = sumMoney([day.amount, r.amount.toString()]);
      if (r.deliveryId) day.deliveries.add(r.deliveryId);
      byDay.set(d, day);
    }
    const total = sumMoney(rows.map((r) => r.amount.toString()));
    const deliveries = new Set(rows.map((r) => r.deliveryId).filter(Boolean)).size;
    const today = istDate();
    return {
      from,
      to,
      total,
      deliveries,
      averagePerDelivery: deliveries ? round2(total / deliveries) : 0,
      today: byDay.get(today)?.amount ?? 0,
      byType,
      daily: [...byDay.values()].map((d) => ({ date: d.date, amount: d.amount, deliveries: d.deliveries.size })).sort((a, b) => a.date.localeCompare(b.date)),
      recent: rows.slice(0, 20),
    };
  }
}
