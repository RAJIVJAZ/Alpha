import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  AccessTokenService,
  canAccessOutlet,
  extractBearer,
  hasPermission,
  Permissions,
} from '@foodgrid/auth';
import { PrismaService } from '@foodgrid/database/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { InternalHttpService } from '@foodgrid/utils/server';

export const orderRoom = (orderId: string) => `order:${orderId}`;
export const riderRoom = (riderId: string) => `rider:${riderId}`;
export const outletRoom = (outletId: string) => `outlet:${outletId}`;
export const OPS_ROOM = 'ops';

/** Token-side check for an outlet feed; the outlet's tenant is checked against order-service. */
export const mayWatchOutlet = (user: AccessTokenClaims | undefined, outletId: string) =>
  !!user?.tenantId &&
  hasPermission(user, Permissions.OrdersRead) &&
  canAccessOutlet(user, outletId);

/**
 * Live tracking over Socket.IO (namespace /tracking). Customers subscribe to
 * their order; riders receive offers in their private room; ops staff see
 * every rider; merchant staff follow their outlet's orders. Scales
 * horizontally through the Redis adapter.
 */
@WebSocketGateway({
  namespace: '/tracking',
  cors: { origin: true, credentials: true },
  path: '/ws',
})
export class TrackingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(TrackingGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly tokens: AccessTokenService,
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
  ) {}

  async handleConnection(client: Socket) {
    const raw =
      (client.handshake.auth?.token as string | undefined) ??
      extractBearer(client.handshake.headers.authorization);
    try {
      const user = this.tokens.verify(raw ?? '');
      client.data.user = user;
      if (user.roles.includes('RIDER')) {
        const rider = await this.prisma.riderProfile.findUnique({
          where: { userId: user.sub },
          select: { id: true },
        });
        if (rider) {
          client.data.riderId = rider.id;
          await client.join(riderRoom(rider.id));
        }
      }
      if (user.roles.some((r) => ['ADMIN', 'OPS', 'SUPPORT'].includes(r)))
        await client.join(OPS_ROOM);
    } catch {
      client.emit('error', { code: 'UNAUTHORIZED' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('order:subscribe')
  async subscribeOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string },
  ) {
    const user = client.data.user as AccessTokenClaims | undefined;
    if (!user || !body?.orderId) return { ok: false };
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId: body.orderId },
      select: { customerId: true, tenantId: true },
    });
    const allowed =
      !!delivery &&
      (delivery.customerId === user.sub ||
        user.tenantId === delivery.tenantId ||
        user.roles.some((r) => ['ADMIN', 'OPS', 'SUPPORT'].includes(r)));
    if (!allowed) return { ok: false, error: 'FORBIDDEN' };
    await client.join(orderRoom(body.orderId));
    return { ok: true };
  }

  @SubscribeMessage('order:unsubscribe')
  async unsubscribeOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string },
  ) {
    await client.leave(orderRoom(body.orderId));
    return { ok: true };
  }

  @SubscribeMessage('outlet:subscribe')
  async subscribeOutlet(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { outletId: string },
  ) {
    const user = client.data.user as AccessTokenClaims | undefined;
    const outletId = typeof body?.outletId === 'string' ? body.outletId : '';
    // outlets belong to order-service; ask it rather than trusting the client's outletId
    const outlet =
      outletId && mayWatchOutlet(user, outletId)
        ? await this.internal
            .get<{ tenantId: string }>('order', `internal/outlets/${encodeURIComponent(outletId)}`)
            .catch(() => null)
        : null;
    if (!outlet || outlet.tenantId !== user?.tenantId) {
      client.emit('error', { code: 'FORBIDDEN', outletId });
      return { ok: false, error: 'FORBIDDEN' };
    }
    await client.join(outletRoom(outletId));
    return { ok: true };
  }

  @SubscribeMessage('outlet:unsubscribe')
  async unsubscribeOutlet(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { outletId: string },
  ) {
    if (typeof body?.outletId === 'string') await client.leave(outletRoom(body.outletId));
    return { ok: true };
  }

  toOrder(orderId: string, event: string, payload: unknown) {
    this.server?.to(orderRoom(orderId)).emit(event, payload);
  }

  toRider(riderId: string, event: string, payload: unknown) {
    this.server?.to(riderRoom(riderId)).emit(event, payload);
  }

  toOutlet(outletId: string, event: string, payload: unknown) {
    this.server?.to(outletRoom(outletId)).emit(event, payload);
  }

  toOps(event: string, payload: unknown) {
    this.server?.to(OPS_ROOM).emit(event, payload);
  }
}
