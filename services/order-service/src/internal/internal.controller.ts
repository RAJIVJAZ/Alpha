import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Internal } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import { conflict, istDayStart, notFound } from '@foodgrid/utils';
import { IdsDto } from '@foodgrid/utils/server';
import { toMoney } from '../common/money';

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
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, outlet: true },
    });
    if (!order) throw notFound('Order', id);
    return order;
  }

  @Get('orders/:id/payable')
  @ApiOperation({ summary: 'Amount due for an order (payment-service)' })
  async orderPayable(@Param('id') id: string): Promise<Payable> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { outlet: { select: { name: true } } },
    });
    if (!order) throw notFound('Order', id);
    return {
      referenceId: id,
      amount: toMoney(order.total),
      userId: order.customerId,
      tenantId: order.tenantId,
      payable: order.status === 'PENDING_PAYMENT' && order.paymentStatus !== 'PAID',
      description: `Order ${order.orderNumber} — ${order.outlet.name}`,
    };
  }

  @Get('memberships/:id/payable')
  async membershipPayable(@Param('id') id: string): Promise<Payable> {
    const m = await this.prisma.customerMembership.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!m) throw notFound('Membership', id);
    return {
      referenceId: id,
      amount: toMoney(m.plan.price),
      userId: m.customerId,
      tenantId: null,
      payable: m.status === 'PENDING_PAYMENT',
      description: `${m.plan.name} membership`,
    };
  }

  @Get('meal-subscriptions/:id/payable')
  async subscriptionPayable(@Param('id') id: string): Promise<Payable> {
    const s = await this.prisma.mealSubscription.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!s) throw notFound('Subscription', id);
    return {
      referenceId: id,
      amount: toMoney(s.amountPaid),
      userId: s.customerId,
      tenantId: s.tenantId,
      payable: s.status === 'PENDING_PAYMENT',
      description: `${s.plan.name} (${s.mealsTotal} meals)`,
    };
  }

  @Post('outlets/batch')
  @ApiOperation({ summary: 'Outlet names for read models (analytics)' })
  outletsBatch(@Body() dto: IdsDto) {
    return this.prisma.outlet.findMany({
      where: { id: { in: dto.ids } },
      select: { id: true, name: true, tenantId: true, type: true, city: true },
    });
  }

  // declared before outlets/:id, which would otherwise capture "cities" as an id
  @Get('outlets/cities')
  @ApiOperation({ summary: 'Cities with active outlets and their centre (ai-service weather)' })
  async activeCities() {
    const rows = await this.prisma.outlet.groupBy({
      by: ['city'],
      where: { status: 'ACTIVE' },
      _avg: { lat: true, lng: true },
      orderBy: { city: 'asc' },
    });
    return rows.map((r) => ({ name: r.city, lat: r._avg.lat!, lng: r._avg.lng! }));
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
    // complete IST days only: today's sales so far would read as a slow day
    const until = istDayStart();
    const since = new Date(until.getTime() - span * 86_400_000);
    // timestamps are stored as UTC "timestamp without time zone": convert UTC -> IST before taking the date
    const rows = await this.prisma.$queryRaw<
      { menuItemId: string; name: string; date: Date; quantity: bigint; avgPrice: unknown }[]
    >`
      SELECT oi."menuItemId", MAX(oi.name) AS name,
             (COALESCE(o."placedAt", o."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS date,
             SUM(oi.quantity) AS quantity,
             ROUND(AVG(oi."unitPrice"), 2) AS "avgPrice"
      FROM "commerce"."OrderItem" oi
      JOIN "commerce"."Order" o ON o.id = oi."orderId"
      WHERE o."outletId" = ${id}
        AND o.status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')
        AND COALESCE(o."placedAt", o."createdAt") >= ${since}
        AND COALESCE(o."placedAt", o."createdAt") < ${until}
      GROUP BY 1, 3
      ORDER BY 3`;
    return rows.map((r) => ({
      ...r,
      date: r.date.toISOString().slice(0, 10),
      quantity: Number(r.quantity),
      avgPrice: Number(r.avgPrice),
    }));
  }

  @Get('orders/:id/assert-active')
  async assertActive(@Param('id') id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!order) throw notFound('Order', id);
    if (['CANCELLED', 'REJECTED'].includes(order.status))
      throw conflict('Order is not active', 'ORDER_INACTIVE');
    return { status: order.status };
  }
}
