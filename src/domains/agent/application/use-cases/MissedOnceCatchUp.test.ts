// application/use-cases/MissedOnceCatchUp.test.ts — STRICT TDD RED phase (task 3.10)
import { describe, it, expect } from 'vitest';
// RED: import the module that doesn't exist yet
import { decideCatchUp } from './MissedOnceCatchUp.js';

/** Local-time helper: month is 1-indexed. */
function at(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

const HOURLY = '0 * * * *';

describe('decideCatchUp — missed-once policy', () => {
  it('3.10 RED: fresh job without watermark never catches up', () => {
    const decision = decideCatchUp({ expr: HOURLY, watermark: undefined, lastFireEnqueued: false, now: at(2026, 9, 18, 11, 30) });
    expect(decision.action).toBe('none');
  });

  it('3.10 RED: no missed firing → none', () => {
    // Watermark 10:00, next fire 11:00, now 10:30 → nothing due.
    const decision = decideCatchUp({ expr: HOURLY, watermark: at(2026, 9, 18, 10, 0).toISOString(), lastFireEnqueued: false, now: at(2026, 9, 18, 10, 30) });
    expect(decision.action).toBe('none');
  });

  it('3.10 RED: a fire due exactly NOW counts as missed (<= now)', () => {
    const decision = decideCatchUp({ expr: HOURLY, watermark: at(2026, 9, 18, 10, 0).toISOString(), lastFireEnqueued: false, now: at(2026, 9, 18, 11, 0) });
    expect(decision.action).toBe('enqueue');
  });

  it('3.10 RED: exactly one missed firing → enqueue once, catchup false, watermark advances past it', () => {
    const decision = decideCatchUp({ expr: HOURLY, watermark: at(2026, 9, 18, 10, 0).toISOString(), lastFireEnqueued: false, now: at(2026, 9, 18, 11, 30) });
    expect(decision).toEqual({
      action: 'enqueue',
      catchup: false,
      fireAt: at(2026, 9, 18, 11, 0).toISOString(),
      nextWatermark: at(2026, 9, 18, 12, 0).toISOString(),
    });
  });

  it('3.10 RED: three missed firings → EXACTLY ONE enqueue with catchup true (never one per miss)', () => {
    // Watermark 08:00; fires at 09:00, 10:00, 11:00 were all missed (now 11:30).
    const decision = decideCatchUp({ expr: HOURLY, watermark: at(2026, 9, 18, 8, 0).toISOString(), lastFireEnqueued: false, now: at(2026, 9, 18, 11, 30) });
    expect(decision.action).toBe('enqueue');
    expect(decision.action === 'enqueue' && decision.fireAt).toBe(at(2026, 9, 18, 9, 0).toISOString()); // the FIRST missed fire
    expect(decision.action === 'enqueue' && decision.catchup).toBe(true);
    expect(decision.action === 'enqueue' && decision.nextWatermark).toBe(at(2026, 9, 18, 12, 0).toISOString()); // next FUTURE occurrence
  });

  it('3.10 RED: crash guard set → advance watermark without enqueueing (no double-enqueue)', () => {
    // Same missed state as the 3-missed case, but the guard says a firing was already enqueued.
    const decision = decideCatchUp({ expr: HOURLY, watermark: at(2026, 9, 18, 8, 0).toISOString(), lastFireEnqueued: true, now: at(2026, 9, 18, 11, 30) });
    expect(decision).toEqual({ action: 'advance', nextWatermark: at(2026, 9, 18, 12, 0).toISOString() });
  });

  it('3.10 RED: applying the decision is idempotent — advanced watermark + cleared guard → none', () => {
    const now = at(2026, 9, 18, 11, 30);
    const first = decideCatchUp({ expr: HOURLY, watermark: at(2026, 9, 18, 8, 0).toISOString(), lastFireEnqueued: false, now });
    if (first.action !== 'enqueue') throw new Error('expected enqueue');
    // Loop persists: watermark := nextWatermark, guard cleared.
    const second = decideCatchUp({ expr: HOURLY, watermark: first.nextWatermark, lastFireEnqueued: false, now });
    expect(second.action).toBe('none');
  });

  it('3.10 RED: stale guard with nothing missed still advances (clears the stuck window)', () => {
    // Crash AFTER watermark advance but BEFORE guard clear: watermark future, guard stuck true.
    const decision = decideCatchUp({ expr: HOURLY, watermark: at(2026, 9, 18, 12, 0).toISOString(), lastFireEnqueued: true, now: at(2026, 9, 18, 11, 30) });
    expect(decision.action).toBe('advance');
  });

  it('3.10 RED: corrupt watermark instant is a loud error, never a silent skip', () => {
    expect(() =>
      decideCatchUp({ expr: HOURLY, watermark: 'not-a-date', lastFireEnqueued: false, now: at(2026, 9, 18, 11, 30) }),
    ).toThrow(RangeError);
  });
});
