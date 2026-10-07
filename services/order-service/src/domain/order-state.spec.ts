import { orderStateMachine, trackingEtaMins } from './order-state';

describe('order state machine', () => {
  it('follows the delivery happy path', () => {
    const path = [
      'PENDING_PAYMENT',
      'PLACED',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ] as const;
    for (let i = 0; i < path.length - 1; i++)
      expect(orderStateMachine.can(path[i]!, path[i + 1]!)).toBe(true);
  });
  it('supports takeaway completion', () => {
    expect(orderStateMachine.can('READY', 'COMPLETED')).toBe(true);
  });
  it('blocks illegal transitions', () => {
    expect(orderStateMachine.can('DELIVERED', 'CANCELLED')).toBe(false);
    expect(orderStateMachine.can('PLACED', 'DELIVERED')).toBe(false);
    expect(() => orderStateMachine.assert('REJECTED', 'ACCEPTED')).toThrow();
  });
});

describe('tracking ETA', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const order = (status: string, extra: Record<string, unknown> = {}) =>
    ({
      status,
      paymentStatus: 'PAID',
      estimatedDeliveryAt: new Date('2026-10-06T12:25:00Z'),
      ...extra,
    }) as Parameters<typeof trackingEtaMins>[0];

  it('counts down to the promised time, preferring the rider estimate', () => {
    expect(trackingEtaMins(order('PREPARING'), null, now)).toBe(25);
    expect(trackingEtaMins(order('PICKED_UP'), { status: 'PICKED_UP', etaMins: 9 }, now)).toBe(9);
    expect(trackingEtaMins(order('ACCEPTED'), { status: 'SEARCHING', etaMins: null }, now)).toBe(
      25,
    );
    expect(trackingEtaMins(order('PREPARING', { estimatedDeliveryAt: null }), null, now)).toBe(
      null,
    );
    // late orders show 0, not a negative countdown
    expect(trackingEtaMins(order('OUT_FOR_DELIVERY'), null, new Date('2026-10-06T13:00:00Z'))).toBe(
      0,
    );
  });

  it.each(['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'])('is null once %s', (status) => {
    expect(trackingEtaMins(order(status), { status: 'PICKED_UP', etaMins: 5 }, now)).toBeNull();
  });

  it('is null when the delivery or the payment failed', () => {
    expect(trackingEtaMins(order('OUT_FOR_DELIVERY'), { status: 'FAILED', etaMins: 4 }, now)).toBe(
      null,
    );
    expect(
      trackingEtaMins(order('PENDING_PAYMENT', { paymentStatus: 'FAILED' }), null, now),
    ).toBeNull();
  });
});
