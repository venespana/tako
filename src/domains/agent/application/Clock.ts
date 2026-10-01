// Clock.ts — PORT interface (application layer owns this, task 3.8)

/**
 * Port: wall-clock access for use cases, keeping the application layer pure
 * and deterministic under test (fakes advance time; production uses Date).
 */
export interface Clock {
  /** Current instant. */
  now(): Date;
}
