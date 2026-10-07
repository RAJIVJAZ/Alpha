import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { OrderStatusChangedEvent } from '@foodgrid/types';
import { dateOnly, istDate, istParts, round2 } from '@foodgrid/utils';

const DEFAULT_COMMISSION_PCT = 18;

/**
 * Maintains the analytics read models. Facts are upserted idempotently and
 * daily aggregates are recomputed from facts for the affected day, so
 * redelivered or out-of-order events can never double count.
 */
@Injectable()
export class ProjectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertOrderFact(o: OrderStatusChangedEvent) {
    const placedAt = o.placedAt ? new Date(o.placedAt) : new Date();
    const date = dateOnly(istDate(placedAt));
    const discount = Number(o.discount);
    const merchantGross =
      Number(o.subtotal) + Number(o.packagingCharge) - Number(o.merchantDiscount);
    const commission = round2(
      (merchantGross * Number(o.commissionRate ?? DEFAULT_COMMISSION_PCT)) / 100,
    );
    const channelRevenue =
      o.channel === 'POS' ? 0 : commission + Number(o.deliveryFee) + Number(o.platformFee);
    const data = {
      orderNumber: o.orderNumber,
      date,
      hour: istParts(placedAt).hour,
      tenantId: o.tenantId,
      outletId: o.outletId,
      outletType: o.outletType,
      city: o.outletCity,
      customerId: o.customerId,
      channel: o.channel,
      orderType: o.type,
      status: o.status,
      paymentMethod: o.paymentMethod,
      itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
      gmv: Number(o.total),
      subtotal: Number(o.subtotal),
      discount,
      deliveryFee: Number(o.deliveryFee),
      tax: Number(o.taxTotal),
      commission: o.channel === 'POS' ? 0 : commission,
      platformRevenue: round2(channelRevenue),
      prepMins: o.prepMins ?? undefined,
      deliveryMins: o.deliveryMins ?? undefined,
      promisedMins: o.promisedMins ?? undefined,
      riderId: o.riderId ?? undefined,
      placedAt,
      ...(o.status === 'DELIVERED' || o.status === 'COMPLETED' ? { deliveredAt: new Date() } : {}),
    };
    const existing = await this.prisma.orderFact.findUnique({ where: { orderId: o.orderId } });
    const isFirstOrder =
      existing?.isFirstOrder ??
      o.isFirstOrder ??
      (o.customerId
        ? (await this.prisma.orderFact.count({
            where: { customerId: o.customerId, orderId: { not: o.orderId } },
          })) === 0
        : false);
    await this.prisma.orderFact.upsert({
      where: { orderId: o.orderId },
      create: { orderId: o.orderId, ...data, isFirstOrder },
      update: data,
    });
    await this.recomputeOutletDay(o.outletId, date);
    await this.recomputePlatformDay(date);
  }

  async setFoodCost(orderId: string, foodCost: number) {
    const fact = await this.prisma.orderFact.findUnique({ where: { orderId } });
    if (!fact) return;
    await this.prisma.orderFact.update({ where: { orderId }, data: { foodCost } });
    await this.recomputeOutletDay(fact.outletId, fact.date);
  }

  async recomputeOutletDay(outletId: string, date: Date) {
    await this.prisma.$executeRaw`
      INSERT INTO "analytics"."DailyOutletStats"
        (id, date, "tenantId", "outletId", orders, "cancelledOrders", gmv, "netSales", discounts, commission,
         "foodCost", "grossProfit", "avgPrepMins", "newCustomers", "repeatCustomers", "updatedAt")
      SELECT gen_random_uuid()::text, ${date}::date, MAX(f."tenantId"), ${outletId},
        COUNT(*) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')),
        COUNT(*) FILTER (WHERE f.status IN ('CANCELLED','REJECTED')),
        COALESCE(SUM(f.gmv) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
        COALESCE(SUM(f.subtotal - f.discount) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
        COALESCE(SUM(f.discount) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
        COALESCE(SUM(f.commission) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
        COALESCE(SUM(f."foodCost") FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
        COALESCE(SUM(f.subtotal - f.discount - f.commission - f."foodCost") FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
        AVG(f."prepMins") FILTER (WHERE f."prepMins" IS NOT NULL),
        COUNT(DISTINCT f."customerId") FILTER (WHERE f."isFirstOrder" AND f.status IN ('DELIVERED','COMPLETED')),
        COUNT(DISTINCT f."customerId") FILTER (WHERE NOT f."isFirstOrder" AND f.status IN ('DELIVERED','COMPLETED')),
        now()
      FROM "analytics"."OrderFact" f
      WHERE f."outletId" = ${outletId} AND f.date = ${date}::date
      HAVING COUNT(*) > 0
      ON CONFLICT ("outletId", date) DO UPDATE SET
        orders = EXCLUDED.orders, "cancelledOrders" = EXCLUDED."cancelledOrders", gmv = EXCLUDED.gmv,
        "netSales" = EXCLUDED."netSales", discounts = EXCLUDED.discounts, commission = EXCLUDED.commission,
        "foodCost" = EXCLUDED."foodCost", "grossProfit" = EXCLUDED."grossProfit", "avgPrepMins" = EXCLUDED."avgPrepMins",
        "newCustomers" = EXCLUDED."newCustomers", "repeatCustomers" = EXCLUDED."repeatCustomers", "updatedAt" = now()`;
  }

  async recomputePlatformDay(date: Date) {
    await this.prisma.$executeRaw`
      INSERT INTO "analytics"."DailyPlatformStats"
        (date, gmv, revenue, orders, "cancelledOrders", "activeCustomers", "activeOutlets", deliveries, "updatedAt")
      SELECT ${date}::date,
        COALESCE(SUM(gmv) FILTER (WHERE status IN ('DELIVERED','COMPLETED')), 0),
        COALESCE(SUM("platformRevenue") FILTER (WHERE status IN ('DELIVERED','COMPLETED')), 0),
        COUNT(*) FILTER (WHERE status IN ('DELIVERED','COMPLETED')),
        COUNT(*) FILTER (WHERE status IN ('CANCELLED','REJECTED')),
        COUNT(DISTINCT "customerId") FILTER (WHERE status IN ('DELIVERED','COMPLETED')),
        COUNT(DISTINCT "outletId"),
        COUNT(*) FILTER (WHERE status = 'DELIVERED' AND "orderType" = 'DELIVERY'),
        now()
      FROM "analytics"."OrderFact" WHERE date = ${date}::date
      ON CONFLICT (date) DO UPDATE SET
        gmv = EXCLUDED.gmv, revenue = EXCLUDED.revenue, orders = EXCLUDED.orders, "cancelledOrders" = EXCLUDED."cancelledOrders",
        "activeCustomers" = EXCLUDED."activeCustomers", "activeOutlets" = EXCLUDED."activeOutlets",
        deliveries = EXCLUDED.deliveries, "updatedAt" = now()`;
  }

  async incrementPlatform(date: Date, field: 'newCustomers' | 'b2bOrders', by = 1, b2bGmv = 0) {
    await this.prisma.dailyPlatformStats.upsert({
      where: { date },
      create: { date, [field]: by, b2bGmv },
      update: { [field]: { increment: by }, b2bGmv: { increment: b2bGmv } },
    });
  }

  async riderDelivered(
    riderId: string,
    at: Date,
    earnings: number,
    distanceKm: number,
    deliveryMins: number | null,
  ) {
    const date = dateOnly(istDate(at));
    const current = await this.prisma.dailyRiderStats.findUnique({
      where: { riderId_date: { riderId, date } },
    });
    const n = (current?.deliveries ?? 0) + 1;
    const avg =
      deliveryMins == null
        ? (current?.avgDeliveryMins ?? null)
        : ((current?.avgDeliveryMins ?? deliveryMins) * (n - 1) + deliveryMins) / n;
    await this.prisma.dailyRiderStats.upsert({
      where: { riderId_date: { riderId, date } },
      create: { riderId, date, deliveries: 1, earnings, distanceKm, avgDeliveryMins: deliveryMins },
      update: {
        deliveries: { increment: 1 },
        earnings: { increment: earnings },
        distanceKm: { increment: distanceKm },
        avgDeliveryMins: avg,
      },
    });
  }

  async supplierEvent(
    tenantId: string,
    at: Date,
    patch: {
      orders?: number;
      gmv?: number;
      units?: number;
      delivered?: number;
      onTime?: number;
      rejected?: number;
    },
  ) {
    const date = dateOnly(istDate(at));
    await this.prisma.dailySupplierStats.upsert({
      where: { tenantId_date: { tenantId, date } },
      create: {
        tenantId,
        date,
        orders: patch.orders ?? 0,
        gmv: patch.gmv ?? 0,
        unitsSold: patch.units ?? 0,
        deliveredOrders: patch.delivered ?? 0,
        onTimeDeliveries: patch.onTime ?? 0,
        rejectedOrders: patch.rejected ?? 0,
      },
      update: {
        orders: { increment: patch.orders ?? 0 },
        gmv: { increment: patch.gmv ?? 0 },
        unitsSold: { increment: patch.units ?? 0 },
        deliveredOrders: { increment: patch.delivered ?? 0 },
        onTimeDeliveries: { increment: patch.onTime ?? 0 },
        rejectedOrders: { increment: patch.rejected ?? 0 },
      },
    });
  }
}
