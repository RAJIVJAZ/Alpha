import 'reflect-metadata';
import type { PrismaService } from '@foodgrid/database/nest';
import { EventTypes, type EventEnvelope, type OrderStatusChangedEvent } from '@foodgrid/types';
import type { DispatchService } from '../dispatch/dispatch.service';
import type { TrackingGateway } from '../tracking/tracking.gateway';
import { DeliveryEventHandlers } from './delivery-event.handlers';

const ORDER = {
  orderId: 'order-1',
  orderNumber: 'FG-1001',
  tenantId: 'tenant-a',
  outletId: 'outlet-a1',
  status: 'PLACED',
  total: '700.00',
  placedAt: '2026-10-07T10:00:00.000Z',
  customerPhone: '+919845000001',
  customerName: 'Asha',
  deliveryOtp: '4821',
} as unknown as OrderStatusChangedEvent;

function handle(type: string, data: Partial<OrderStatusChangedEvent> = {}) {
  const gateway = { toOutlet: jest.fn() };
  const handlers = new DeliveryEventHandlers(
    {} as PrismaService,
    {} as DispatchService,
    gateway as unknown as TrackingGateway,
  );
  const env = { id: 'evt-1', type, data: { ...ORDER, ...data } } as EventEnvelope<
    string,
    OrderStatusChangedEvent
  >;
  return handlers.onOrderForOutlet(env).then(() => gateway.toOutlet.mock.calls);
}

describe('DeliveryEventHandlers.onOrderForOutlet', () => {
  it('announces a placed order to the outlet room without customer contact or OTP', async () => {
    const calls = await handle(EventTypes.OrderPlaced);
    expect(calls).toEqual([
      [
        'outlet-a1',
        'order:new',
        {
          orderId: 'order-1',
          orderNumber: 'FG-1001',
          outletId: 'outlet-a1',
          status: 'PLACED',
          total: '700.00',
          placedAt: '2026-10-07T10:00:00.000Z',
        },
      ],
    ]);
  });

  it('sends later transitions as order:status', async () => {
    const calls = await handle(EventTypes.OrderReady, { status: 'READY' });
    expect(calls).toEqual([
      [
        'outlet-a1',
        'order:status',
        { orderId: 'order-1', orderNumber: 'FG-1001', outletId: 'outlet-a1', status: 'READY' },
      ],
    ]);
  });

  it('stays quiet about orders cancelled before payment', async () => {
    expect(
      await handle(EventTypes.OrderCancelled, { status: 'CANCELLED', placedAt: null }),
    ).toEqual([]);
  });
});
