import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Internal } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import { conflict, notFound } from '@foodgrid/utils';

export interface Payable {
  referenceId: string;
  amount: string;
  userId: string | null;
  tenantId: string | null;
  payable: boolean;
  description: string;
}

/** Service-to-service API (blocked at the gateway). */
@ApiTags('internal')
@Internal()
@Controller('internal')
export class InternalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('orders/:id')
  async order(@Param('id') id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true, outlet: true } });
    if (!order) throw notFound('Order', id);
    return order;
  }

  @Get('orders/:id/payable')
  @ApiOperation({ summary: 'Amount due for an order (payment-service)' })
  async orderPayable(@Param('id') id: string): Promise<Payable> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { outlet: { select: { name: true } } } });
    if (!order) throw notFound('Order', id);
    return {
      referenceId: id,
      amount: order.total.toString(),
      userId: order.customerId,
      tenantId: order.tenantId,
      payable: order.status === 'PENDING_PAYMENT' && order.paymentStatus !== 'PAID',
      description: `Order ${order.orderNumber} — ${order.outlet.name}`,
    };
  }

  @Get('memberships/:id/payable')
  async membershipPayable(@Param('id') id: string): Promise<Payable> {
    const m = await this.prisma.customerMembership.findUnique({ where: { id }, include: { plan: true } });
    if (!m) throw notFound('Membership', id);
    return {
      referenceId: id,
      amount: m.plan.price.toString(),
      userId: m.customerId,
      tenantId: null,
      payable: m.status === 'PENDING_PAYMENT',
      description: `${m.plan.name} membership`,
    };
  }

  @Get('meal-subscriptions/:id/payable')
  async subscriptionPayable(@Param('id') id: string): Promise<Payable> {
    const s = await this.prisma.mealSubscription.findUnique({ where: { id }, include: { plan: true } });
    if (!s) throw notFound('Subscription', id);
    return {
      referenceId: id,
      amount: s.amountPaid.toString(),
      userId: s.customerId,
      tenantId: s.tenantId,
      payable: s.status === 'PENDING_PAYMENT',
      description: `${s.plan.name} (${s.mealsTotal} meals)`,
    };
  }

  @Get('outlets/:id')
  async outlet(@Param('id') id: string) {
    const outlet = await this.prisma.outlet.findUnique({ where: { id } });
    if (!outlet) throw notFound('Outlet', id);
    return outlet;
  }

  @Get('outlets/:id/menu-prices')
  @ApiOperation({ summary: 'Selling prices for costing (inventory-service)' })
  menuPrices(@Param('id') id: string) {
    return this.prisma.menuItem.findMany({
      where: { outletId: id },
      select: { id: true, name: true, price: true, isAvailable: true, categoryId: true },
    });
  }

  @Get('outlets/:id/item-sales')
  @ApiOperation({ summary: 'Daily item quantities for production planning' })
  async itemSales(@Param('id') id: string, @Query('days') days = '28') {
    const span = Math.min(180, Math.max(7, Number(days) || 28));
    if (!(await this.prisma.outlet.count({ where: { id } }))) throw notFound('Outlet', id);
    const rows = await this.prisma.$queryRaw<{ menuItemId: string; name: string; date: Date; quantity: bigint }[]>`
      SELECT oi."menuItemId", MAX(oi.name) AS name,
             (o."createdAt" AT TIME ZONE 'Asia/Kolkata')::date AS date,
             SUM(oi.quantity) AS quantity
      FROM "commerce"."OrderItem" oi
      JOIN "commerce"."Order" o ON o.id = oi."orderId"
      WHERE o."outletId" = ${id}
        AND o.status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')
        AND o."createdAt" >= now() - make_interval(days => ${span})
      GROUP BY 1, 3
      ORDER BY 3`;
    return rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10), quantity: Number(r.quantity) }));
  }

  @Get('orders/:id/assert-active')
  async assertActive(@Param('id') id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!order) throw notFound('Order', id);
    if (['CANCELLED', 'REJECTED'].includes(order.status)) throw conflict('Order is not active', 'ORDER_INACTIVE');
    return { status: order.status };
  }
}
