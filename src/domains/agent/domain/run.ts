// domain/run.ts — run state machine (task 3.4)
//
// Per-execution lifecycle (design §Job & Run Model):
//
//   pending ──▶ running ──▶ succeeded | failed
//                   └─────▶ unsupported      (server-config stub, v0)
//
// All terminal statuses absorb: no retries, serial execution in v0. Illegal
// transitions are rejected here — the pure guard — never downstream.

import type { RunStatus } from './types.js';

/** Thrown when a run status change violates the state machine. */
export class IllegalRunTransitionError extends Error {
  constructor(from: RunStatus, to: RunStatus) {
    super(`illegal run transition: ${from} → ${to}`);
    this.name = 'IllegalRunTransitionError';
  }
}

/** Closed transition table; terminal statuses have no outgoing edges. */
export const RUN_TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  pending: ['running'],
  running: ['succeeded', 'failed', 'unsupported'],
  succeeded: [],
  failed: [],
  unsupported: [],
};

/** True when the status change `from → to` is legal. */
export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

/**
 * Pure transition guard: returns the target status when legal.
 *
 * @throws IllegalRunTransitionError when the move is not in the table.
 */
export function transitionRun(from: RunStatus, to: RunStatus): RunStatus {
  if (!canTransitionRun(from, to)) {
    throw new IllegalRunTransitionError(from, to);
  }
  return to;
}
