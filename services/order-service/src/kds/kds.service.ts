import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { KdsStatus, Order, OrderItem, Prisma } from '@foodgrid/database';
import { istDateStamp, nextSequence } from '@foodgrid/database';
import type { AccessTokenClaims, KitchenTicketView } from '@foodgrid/types';
import { conflict, notFound } from '@foodgrid/utils';
import { outletScope } from '../common/outlet-access';

type Tx = Prisma.TransactionClient;

const ACTIVE: KdsStatus[] = ['QUEUED', 'IN_PROGRESS', 'READY'];

/**
 * Kitchen display system. One ticket per (order, station); the order becomes
 * READY when every station has finished.
 */
@Injectable()
export class KdsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTickets(tx: Tx, order: Order & { items: OrderItem[] }) {
    const existing = await tx.kitchenTicket.count({ where: { orderId: order.id } });
    if (existing) return;
    const ticketNumber = Number(await nextSequence(tx, `KDS-${order.outletId}-${istDateStamp()}`));
    const byStation = new Map<string, OrderItem[]>();
    for (const item of order.items) {
      const list = byStation.get(item.kdsStation) ?? [];
      list.push(item);
      byStation.set(item.kdsStation, list);
    }
    for (const [station, items] of byStation) {
      await tx.kitchenTicket.create({
        data: {
          tenantId: order.tenantId,
          outletId: order.outletId,
          orderId: order.id,
          ticketNumber,
          station,
          priority: order.channel === 'POS' || order.type === 'DINE_IN' ? 1 : 0,
          items: items.map((i) => ({
            orderItemId: i.id,
            name: i.name,
            quantity: i.quantity,
            variant: i.variant,
            addons: (i.addons as { name: string }[]).map((a) => a.name),
            notes: i.notes,
          })) as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  async cancelTickets(tx: Tx, orderId: string) {
    await tx.kitchenTicket.updateMany({ where: { orderId, status: { in: ACTIVE } }, data: { status: 'CANCELLED' } });
  }

  async board(user: AccessTokenClaims, q: { outletId?: string; station?: string; statuses?: KdsStatus[] }): Promise<KitchenTicketView[]> {
    const tickets = await this.prisma.forTenant(user.tenantId!).kitchenTicket.findMany({
      where: {
        ...outletScope(user, q.outletId),
        station: q.station,
        status: { in: q.statuses?.length ? q.statuses : ACTIVE },
      },
      include: { order: { select: { orderNumber: true, type: true, specialInstructions: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
    const now = Date.now();
    return tickets.map((t) => ({
      id: t.id,
      orderId: t.orderId,
      orderNumber: t.order.orderNumber,
      ticketNumber: t.ticketNumber,
      station: t.station,
      status: t.status,
      orderType: t.order.type,
      createdAt: t.createdAt.toISOString(),
      elapsedSeconds: Math.round((now - t.createdAt.getTime()) / 1000),
      items: t.items as unknown as KitchenTicketView['items'],
    }));
  }

  async getOwned(user: AccessTokenClaims, id: string) {
    const ticket = await this.prisma.forTenant(user.tenantId!).kitchenTicket.findUnique({ where: { id } });
    if (!ticket) throw notFound('Ticket', id);
    outletScope(user, ticket.outletId);
    return ticket;
  }

  /** Moves a ticket and returns whether every ticket of the order is now ready. */
  async setStatus(tx: Tx, ticketId: string, status: KdsStatus): Promise<{ orderId: string; allReady: boolean; firstStart: boolean }> {
    const ticket = await tx.kitchenTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw notFound('Ticket', ticketId);
    if (ticket.status === 'CANCELLED') throw conflict('Ticket was cancelled', 'TICKET_CANCELLED');
    const now = new Date();
    await tx.kitchenTicket.update({
      where: { id: ticketId },
      data: {
        status,
        ...(status === 'IN_PROGRESS' && !ticket.startedAt ? { startedAt: now } : {}),
        ...(status === 'READY' ? { readyAt: now } : {}),
        ...(status === 'SERVED' ? { bumpedAt: now } : {}),
      },
    });
    const siblings = await tx.kitchenTicket.findMany({ where: { orderId: ticket.orderId, status: { not: 'CANCELLED' } } });
    const started = siblings.filter((s) => s.startedAt).length;
    return {
      orderId: ticket.orderId,
      allReady: siblings.every((s) => s.status === 'READY' || s.status === 'SERVED'),
      firstStart: status === 'IN_PROGRESS' && started === 1 && !ticket.startedAt,
    };
  }
}
