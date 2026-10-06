import { AppError } from './errors';
import { StateMachine } from './state-machine';

describe('StateMachine', () => {
  const sm = new StateMachine<'A' | 'B' | 'C'>('Thing', { A: ['B'], B: ['C'], C: [] });
  it('allows declared transitions only', () => {
    expect(sm.can('A', 'B')).toBe(true);
    expect(sm.can('A', 'C')).toBe(false);
    expect(() => sm.assert('A', 'C')).toThrow(AppError);
    expect(sm.isTerminal('C')).toBe(true);
  });
});
