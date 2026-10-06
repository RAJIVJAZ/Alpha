import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { istDate, round2, sumMoney } from '@foodgrid/utils';
import { resolveIstRange } from '@foodgrid/utils/server';

/** Seller-side analytics computed from the marketplace's own tables. */
@Injectable()
export class SellerAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string, q: { from?: string; to?: string }) {
    const { from, to } = resolveIstRange(q, 30);
    const orders = await this.prisma.b2bOrder.findMany({
      where: { sellerTenantId: tenantId, createdAt: { gte: from, lte: to } },
      include: { items: true },
    });
    const delivered = orders.filter((o) => o.status === 'DELIVERED');
    const byDay = new Map<string, { date: string; orders: number; gmv: number }>();
    const products = new Map<string, { productId: string; name: string; units: number; revenue: number }>();
    const buyers = new Map<string, { buyerTenantId: string; name: string; orders: number; gmv: number }>();
    for (const o of orders) {
      if (['CANCELLED', 'REJECTED'].includes(o.status)) continue;
      const d = istDate(o.createdAt);
      const day = byDay.get(d) ?? { date: d, orders: 0, gmv: 0 };
      day.orders += 1;
      day.gmv = sumMoney([day.gmv, o.total.toString()]);
      byDay.set(d, day);
      const b = buyers.get(o.buyerTenantId) ?? { buyerTenantId: o.buyerTenantId, name: o.buyerName, orders: 0, gmv: 0 };
      b.orders += 1;
      b.gmv = sumMoney([b.gmv, o.total.toString()]);
      buyers.set(o.buyerTenantId, b);
      for (const i of o.items) {
        const p = products.get(i.productId) ?? { productId: i.productId, name: i.name, units: 0, revenue: 0 };
        p.units = round2(p.units + Number(i.confirmedQty ?? i.quantity));
        p.revenue = sumMoney([p.revenue, i.lineTotal.toString()]);
        products.set(i.productId, p);
      }
    }
    const valid = orders.filter((o) => !['CANCELLED', 'REJECTED'].includes(o.status));
    const gmv = sumMoney(valid.map((o) => o.total.toString()));
    const onTime = delivered.filter((o) => !o.expectedDeliveryAt || (o.deliveredAt && o.deliveredAt <= o.expectedDeliveryAt)).length;
    const lowStock = await this.prisma.product.count({ where: { tenantId, stockStatus: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] }, isActive: true } });
    return {
      from,
      to,
      orders: valid.length,
      gmv,
      averageOrderValue: valid.length ? round2(gmv / valid.length) : 0,
      fulfilmentRate: orders.length ? round2((delivered.length / orders.length) * 100) : 0,
      onTimeRate: delivered.length ? round2((onTime / delivered.length) * 100) : 0,
      rejectionRate: orders.length ? round2((orders.filter((o) => o.status === 'REJECTED').length / orders.length) * 100) : 0,
      pendingConfirmation: orders.filter((o) => o.status === 'PLACED').length,
      lowStockProducts: lowStock,
      daily: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
      topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      topBuyers: [...buyers.values()].sort((a, b) => b.gmv - a.gmv).slice(0, 10),
    };
  }
}
