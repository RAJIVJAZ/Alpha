import { AppError } from './errors';

/** Declarative finite state machine for entity lifecycles. */
export class StateMachine<S extends string> {
  constructor(
    private readonly name: string,
    private readonly transitions: Readonly<Record<S, readonly S[]>>,
  ) {}

  can(from: S, to: S): boolean {
    return (this.transitions[from] ?? []).includes(to);
  }

  assert(from: S, to: S): void {
    if (!this.can(from, to)) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `${this.name} cannot move from ${from} to ${to}`,
        409,
        { from, to, allowed: this.transitions[from] ?? [] },
      );
    }
  }

  next(from: S): readonly S[] {
    return this.transitions[from] ?? [];
  }

  isTerminal(state: S): boolean {
    return (this.transitions[state] ?? []).length === 0;
  }
}
