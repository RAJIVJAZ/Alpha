import { Injectable } from '@nestjs/common';
import { randomToken } from '@foodgrid/auth';
import { PrismaService } from '@foodgrid/database/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { conflict, isWithinOpeningHours, notFound, OpeningWindow } from '@foodgrid/utils';
import { assertOutletAccess } from '../common/outlet-access';
import { DirectOrderService } from '../orders/direct-order.service';
import { OutletsService } from '../outlets/outlets.service';
import { QrOrderDto, TableDto } from './dto/qr.dto';

const CUSTOMER_WEB_URL = process.env.CUSTOMER_WEB_URL ?? 'http://localhost:3000';

/** Scan-to-order at the table (restaurants) or at the cart (food carts). */
@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly direct: DirectOrderService,
    private readonly outlets: OutletsService,
  ) {}

  private withUrl<T extends { qrToken: string }>(t: T) {
    return { ...t, qrUrl: `${CUSTOMER_WEB_URL}/t/${t.qrToken}` };
  }

  async listTables(user: AccessTokenClaims, outletId: string) {
    await assertOutletAccess(this.prisma, user, outletId);
    const tables = await this.prisma
      .forTenant(user.tenantId!)
      .diningTable.findMany({ where: { outletId }, orderBy: { label: 'asc' } });
    return tables.map((t) => this.withUrl(t));
  }

  async createTable(user: AccessTokenClaims, outletId: string, dto: TableDto) {
    await assertOutletAccess(this.prisma, user, outletId);
    const table = await this.prisma.forTenant(user.tenantId!).diningTable.create({
      data: {
        outletId,
        tenantId: user.tenantId!,
        label: dto.label,
        seats: dto.seats ?? 4,
        qrToken: randomToken(16),
      },
    });
    return this.withUrl(table);
  }

  async rotateToken(user: AccessTokenClaims, tableId: string) {
    const table = await this.prisma
      .forTenant(user.tenantId!)
      .diningTable.findUnique({ where: { id: tableId } });
    if (!table) throw notFound('Table', tableId);
    await assertOutletAccess(this.prisma, user, table.outletId);
    return this.withUrl(
      await this.prisma.diningTable.update({
        where: { id: tableId },
        data: { qrToken: randomToken(16) },
      }),
    );
  }

  private async resolve(token: string) {
    const table = await this.prisma.diningTable.findUnique({
      where: { qrToken: token },
      include: { outlet: true },
    });
    if (!table || !table.isActive) throw notFound('Table');
    if (!table.outlet.acceptsQrOrders || table.outlet.status !== 'ACTIVE') {
      throw conflict('QR ordering is not available here', 'QR_DISABLED');
    }
    return table;
  }

  async scan(token: string) {
    const table = await this.resolve(token);
    const menu = await this.outlets.publicMenu(table.outletId);
    return { table: { id: table.id, label: table.label, seats: table.seats }, ...menu };
  }

  async order(token: string, dto: QrOrderDto, userId?: string) {
    const table = await this.resolve(token);
    const open =
      table.outlet.isOpen &&
      isWithinOpeningHours(table.outlet.openingHours as unknown as OpeningWindow[]);
    if (!open) throw conflict('The kitchen is closed right now', 'OUTLET_CLOSED');
    const payAtCounter = dto.payAtCounter ?? true;
    if (!payAtCounter && !userId) throw conflict('Log in to pay online', 'LOGIN_REQUIRED');
    const order = await this.direct.create({
      outlet: table.outlet,
      channel: 'QR',
      type: 'DINE_IN',
      lines: dto.items,
      customerId: userId,
      customerName: dto.customerName ?? `Table ${table.label}`,
      customerPhone: dto.customerPhone,
      paymentMethod: payAtCounter ? 'CASH' : null,
      paymentStatus: payAtCounter ? 'COD_PENDING' : 'PENDING',
      status: payAtCounter ? 'PLACED' : 'PENDING_PAYMENT',
      actorType: 'CUSTOMER',
      actorId: userId,
      tableId: table.id,
      specialInstructions: dto.notes,
    });
    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        table: table.label,
      },
      payment: payAtCounter
        ? null
        : { required: true, purpose: 'ORDER', referenceId: order.id, amount: order.total },
    };
  }
}
