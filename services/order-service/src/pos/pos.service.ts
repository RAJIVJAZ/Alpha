import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { istDate, istParts, money, notFound, sumMoney } from '@foodgrid/utils';
import { assertOutletAccess } from '../common/outlet-access';
import { DirectOrderService } from '../orders/direct-order.service';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { PosOrderDto } from './dto/pos.dto';

/** Mobile-friendly counter billing for food carts and restaurants. */
@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly direct: DirectOrderService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  async createOrder(user: AccessTokenClaims, dto: PosOrderDto) {
    const outlet = await assertOutletAccess(this.prisma, user, dto.outletId);
    if (dto.tableId) {
      const table = await this.prisma.diningTable.findFirst({ where: { id: dto.tableId, outletId: outlet.id } });
      if (!table) throw notFound('Table', dto.tableId);
    }
    const order = await this.direct.create({
      outlet,
      channel: 'POS',
      type: dto.orderType,
      lines: dto.items,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      paymentMethod: dto.paymentMethod,
      paymentStatus: 'PAID',
      status: 'ACCEPTED',
      actorType: 'MERCHANT',
      actorId: user.sub,
      tableId: dto.tableId,
      discount: dto.discount,
      specialInstructions: dto.notes,
    });
    return { order, receipt: this.receipt(order) };
  }

  async complete(user: AccessTokenClaims, orderId: string) {
    const order = await this.prisma.forTenant(user.tenantId!).order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('Order', orderId);
    await assertOutletAccess(this.prisma, user, order.outletId);
    if (['ACCEPTED', 'PREPARING'].includes(order.status)) {
      await this.lifecycle.transition(orderId, 'READY', { actorType: 'MERCHANT', actorId: user.sub });
    }
    return this.lifecycle.transition(orderId, 'COMPLETED', { actorType: 'MERCHANT', actorId: user.sub });
  }

  receipt(order: Awaited<ReturnType<DirectOrderService['create']>>) {
    return {
      orderNumber: order.orderNumber,
      outlet: { name: order.outlet.name, address: order.outlet.addressLine1, gstin: order.outlet.gstin, fssai: order.outlet.fssaiNumber },
      items: order.items.map((i) => ({ name: i.variant ? `${i.name} (${i.variant})` : i.name, qty: i.quantity, rate: i.unitPrice, amount: i.totalPrice })),
      subtotal: order.subtotal,
      discount: order.couponDiscount,
      cgst: order.cgst,
      sgst: order.sgst,
      roundOff: order.roundOff,
      total: order.total,
      paymentMethod: order.paymentMethod,
      issuedAt: order.createdAt,
    };
  }

  /** Daily sales tracking (IST business day). */
  async summary(user: AccessTokenClaims, outletId: string, date?: string) {
    await assertOutletAccess(this.prisma, user, outletId);
    const day = date?.slice(0, 10) ?? istDate();
    const from = new Date(`${day}T00:00:00+05:30`);
    const to = new Date(from.getTime() + 86_400_000);
    const orders = await this.prisma.forTenant(user.tenantId!).order.findMany({
      where: { outletId, createdAt: { gte: from, lt: to }, status: { not: 'PENDING_PAYMENT' } },
      include: { items: true },
    });
    const valid = orders.filter((o) => !['CANCELLED', 'REJECTED'].includes(o.status));
    const byPayment: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, sales: 0 }));
    const items = new Map<string, { name: string; quantity: number; sales: number }>();
    for (const o of valid) {
      const key = o.paymentMethod ?? 'UNPAID';
      byPayment[key] = sumMoney([byPayment[key] ?? 0, o.total.toString()]);
      byChannel[o.channel] = sumMoney([byChannel[o.channel] ?? 0, o.total.toString()]);
      const h = istParts(o.createdAt).hour;
      hourly[h]!.orders += 1;
      hourly[h]!.sales = sumMoney([hourly[h]!.sales, o.total.toString()]);
      for (const i of o.items) {
        const agg = items.get(i.menuItemId) ?? { name: i.name, quantity: 0, sales: 0 };
        agg.quantity += i.quantity;
        agg.sales = sumMoney([agg.sales, i.totalPrice.toString()]);
        items.set(i.menuItemId, agg);
      }
    }
    const gross = sumMoney(valid.map((o) => o.total.toString()));
    return {
      date: day,
      orders: valid.length,
      cancelled: orders.length - valid.length,
      grossSales: money(gross),
      taxCollected: money(sumMoney(valid.map((o) => o.taxTotal.toString()))),
      discounts: money(sumMoney(valid.map((o) => o.couponDiscount.toString()))),
      averageTicket: money(valid.length ? gross / valid.length : 0),
      byPaymentMethod: byPayment,
      byChannel,
      hourly,
      topItems: [...items.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    };
  }
}
