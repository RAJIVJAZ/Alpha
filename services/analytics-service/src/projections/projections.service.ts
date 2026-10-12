import { Injectable } from '@nestjs/common';
import { Prisma } from '@foodgrid/database';
import { PrismaService } from '@foodgrid/database/nest';
import { ORDER_STATUSES, type OrderStatusChangedEvent } from '@foodgrid/types';
import { dateOnly, istDate, istParts, round2 } from '@foodgrid/utils';

const TERMINAL: string[] = ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'];
/** Lifecycle rank; terminal statuses share the top rank so nothing ever replaces them. */
const rank = (s: string) =>
  TERMINAL.includes(s) ? ORDER_STATUSES.length : ORDER_STATUSES.indexOf(s as never);
/** Stored statuses an event with status `s` may move a fact forward from. */
const behind = (s: string) => ORDER_STATUSES.filter((x) => rank(x) < rank(s));

/**
 * Maintains the analytics read models. Facts are upserted idempotently and
 * daily aggregates are recomputed from facts for the affected day, so
 * redelivered or out-of-order events can never double count, and a late
 * event never moves a fact's status backwards.
 */
@Injectable()
export class ProjectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertOrderFact(o: OrderStatusChangedEvent) {
    const placedAt = o.placedAt ? new Date(o.placedAt) : new Date();
    const date = dateOnly(istDate(placedAt));
    const discount = Number(o.discount);
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
      paymentMethod: o.paymentMethod,
      itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
      gmv: Number(o.total),
      subtotal: Number(o.subtotal),
      discount,
      merchantDiscount: Number(o.merchantDiscount ?? 0),
      packagingCharge: Number(o.packagingCharge ?? 0),
      deliveryFee: Number(o.deliveryFee),
      tax: Number(o.taxTotal),
      prepMins: o.prepMins ?? undefined,
      deliveryMins: o.deliveryMins ?? undefined,
      promisedMins: o.promisedMins ?? undefined,
      riderId: o.riderId ?? undefined,
      placedAt,
    };
    const progress = {
      status: o.status,
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
    // Commission is decided by payment-service when the order settles (setCommission), so
    // later status events never overwrite it; a new fact starts with what the order carries.
    const commission = Number(o.commissionAmount ?? 0);
    const platformRevenue =
      o.channel === 'POS' ? 0 : round2(commission + Number(o.deliveryFee) + Number(o.platformFee));
    await this.prisma.orderFact.upsert({
      where: { orderId: o.orderId },
      create: {
        orderId: o.orderId,
        ...data,
        ...progress,
        isFirstOrder,
        commission,
        platformRevenue,
      },
      update: data,
    });
    // status only moves forward: a late, reclaimed or concurrent older event never replaces a
    // newer or terminal one (Postgres re-checks the WHERE under the row lock)
    await this.prisma.orderFact.updateMany({
      where: { orderId: o.orderId, status: { in: behind(o.status) } },
      data: progress,
    });
    await this.recomputeOutletDay(o.outletId, date);
    await this.recomputePlatformDay(date);
  }

  /** The commission payment-service charged (payment.commission.accrued) replaces the placeholder. */
  async setCommission(orderId: string, amount: string) {
    const fact = await this.prisma.orderFact.findUnique({ where: { orderId } });
    // the order stream normally lands first; failing makes the consumer redeliver later
    if (!fact) throw new Error(`No order fact for ${orderId} yet`);
    const commission = new Prisma.Decimal(amount);
    await this.prisma.orderFact.update({
      where: { orderId },
      data: {
        commission,
        platformRevenue: fact.platformRevenue.minus(fact.commission).plus(commission),
      },
    });
    await this.recomputeOutletDay(fact.outletId, fact.date);
    await this.recomputePlatformDay(fact.date);
  }

  async setFoodCost(orderId: string, foodCost: number) {
    const fact = await this.prisma.orderFact.findUnique({ where: { orderId } });
    // stock.consumed follows order.accepted, but while catching up the inventory stream is read
    // ahead of the order stream; failing makes the consumer redeliver it once the fact exists
    if (!fact) throw new Error(`No order fact for ${orderId} yet`);
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
        -- net sales: what the merchant sells, as settlement taxes and commissions it
        COALESCE(SUM(f.subtotal + f."packagingCharge" - f."merchantDiscount") FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
        COALESCE(SUM(f.discount) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
        COALESCE(SUM(f.commission) FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
        COALESCE(SUM(f."foodCost") FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
        COALESCE(SUM(f.subtotal + f."packagingCharge" - f."merchantDiscount" - f.commission - f."foodCost") FILTER (WHERE f.status IN ('DELIVERED','COMPLETED')), 0),
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

  /**
   * Runs counter updates (blind increments) once per event and handler: they commit together
   * with the consumer's own processed-event row, so a handler retried after a crash, before the
   * consumer recorded it, finds the row and adds nothing twice.
   */
  async once(
    mark: { consumer: string; eventId: string; eventType: string },
    apply: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.processedEvent.createMany({ data: [mark], skipDuplicates: true });
      if (count) await apply(tx);
    });
  }

  async incrementPlatform(
    db: Prisma.TransactionClient,
    date: Date,
    field: 'newCustomers' | 'b2bOrders',
    by = 1,
    b2bGmv = 0,
  ) {
    await db.dailyPlatformStats.upsert({
      where: { date },
      create: { date, [field]: by, b2bGmv },
      update: { [field]: { increment: by }, b2bGmv: { increment: b2bGmv } },
    });
  }

  async riderDelivered(
    db: Prisma.TransactionClient,
    riderId: string,
    at: Date,
    earnings: number,
    distanceKm: number,
    deliveryMins: number | null,
  ) {
    const date = dateOnly(istDate(at));
    const current = await db.dailyRiderStats.findUnique({
      where: { riderId_date: { riderId, date } },
    });
    const n = (current?.deliveries ?? 0) + 1;
    const avg =
      deliveryMins == null
        ? (current?.avgDeliveryMins ?? null)
        : ((current?.avgDeliveryMins ?? deliveryMins) * (n - 1) + deliveryMins) / n;
    await db.dailyRiderStats.upsert({
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
    db: Prisma.TransactionClient,
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
    await db.dailySupplierStats.upsert({
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
