import { orderStateMachine } from './order-state';

describe('order state machine', () => {
  it('follows the delivery happy path', () => {
    const path = ['PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;
    for (let i = 0; i < path.length - 1; i++) expect(orderStateMachine.can(path[i]!, path[i + 1]!)).toBe(true);
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
