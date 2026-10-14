// domain/schedule.test.ts — STRICT TDD RED phase (task 3.3)
import { describe, it, expect } from 'vitest';

// RED: import the module that doesn't exist yet
import { matches, nextAfter, isValidCronExpr, InvalidCronError } from './schedule.js';

/** Local-time helper: new Date(2026, 1, 29, 4, 30) — month is 1-indexed here. */
function at(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe('matches — field syntax', () => {
  it('3.3 RED: star matches every minute', () => {
    expect(matches('* * * * *', at(2026, 9, 17, 12, 34))).toBe(true);
    expect(matches('* * * * *', at(2026, 1, 1, 0, 0))).toBe(true);
  });

  it('3.3 RED: exact minute and hour', () => {
    expect(matches('30 4 * * *', at(2026, 9, 17, 4, 30))).toBe(true);
    expect(matches('30 4 * * *', at(2026, 9, 17, 4, 31))).toBe(false);
    expect(matches('30 4 * * *', at(2026, 9, 17, 5, 30))).toBe(false);
  });

  it('3.3 RED: lists', () => {
    expect(matches('0,15,30,45 * * * *', at(2026, 9, 17, 1, 15))).toBe(true);
    expect(matches('0,15,30,45 * * * *', at(2026, 9, 17, 1, 16))).toBe(false);
  });

  it('3.3 RED: ranges', () => {
    expect(matches('20-30 12 * * *', at(2026, 9, 17, 12, 20))).toBe(true);
    expect(matches('20-30 12 * * *', at(2026, 9, 17, 12, 25))).toBe(true);
    expect(matches('20-30 12 * * *', at(2026, 9, 17, 12, 31))).toBe(false);
  });

  it('3.3 RED: steps */n', () => {
    expect(matches('*/15 * * * *', at(2026, 9, 17, 8, 0))).toBe(true);
    expect(matches('*/15 * * * *', at(2026, 9, 17, 8, 45))).toBe(true);
    expect(matches('*/15 * * * *', at(2026, 9, 17, 8, 50))).toBe(false);
  });

  it('3.3 RED: range with step', () => {
    expect(matches('10-30/10 * * * *', at(2026, 9, 17, 6, 10))).toBe(true);
    expect(matches('10-30/10 * * * *', at(2026, 9, 17, 6, 20))).toBe(true);
    expect(matches('10-30/10 * * * *', at(2026, 9, 17, 6, 40))).toBe(false);
  });

  it('3.3 RED: month restriction', () => {
    expect(matches('0 0 1 6 *', at(2026, 6, 1, 0, 0))).toBe(true);
    expect(matches('0 0 1 6 *', at(2026, 7, 1, 0, 0))).toBe(false);
  });

  it('3.3 RED: day-of-week (0 = Sunday, 7 also Sunday)', () => {
    expect(matches('0 12 * * 0', at(2026, 9, 20, 12, 0))).toBe(true); // 2026-09-20 is a Sunday
    expect(matches('0 12 * * 7', at(2026, 9, 20, 12, 0))).toBe(true);
    expect(matches('0 12 * * 1', at(2026, 9, 21, 12, 0))).toBe(true); // Monday
    expect(matches('0 12 * * 1', at(2026, 9, 20, 12, 0))).toBe(false);
  });
});

describe('matches — dom/dow interaction (Vixie cron rule)', () => {
  // 2026-09-13 is a Sunday and the 13th; 2026-09-12 is a Saturday (12th, not Friday);
  // 2026-09-18 is a Friday (not the 13th); 2026-09-17 is a Thursday (12th? no — the 17th).
  it('3.3 RED: both restricted — matches if EITHER dom or dow matches', () => {
    expect(matches('0 0 13 * 5', at(2026, 9, 13, 0, 0))).toBe(true); // 13th (Sunday) — dom matches
    expect(matches('0 0 13 * 5', at(2026, 9, 18, 0, 0))).toBe(true); // Friday — dow matches
    expect(matches('0 0 13 * 5', at(2026, 9, 12, 0, 0))).toBe(false); // Saturday the 12th — neither
  });

  it('3.3 RED: only dom restricted — dow ignored', () => {
    expect(matches('0 0 13 * *', at(2026, 9, 13, 0, 0))).toBe(true);
    expect(matches('0 0 13 * *', at(2026, 9, 12, 0, 0))).toBe(false);
  });
});

describe('matches — calendar edge cases', () => {
  it('3.3 RED: leap day fires only on Feb 29', () => {
    expect(matches('0 0 29 2 *', at(2024, 2, 29, 0, 0))).toBe(true);
    expect(matches('0 0 29 2 *', at(2023, 2, 28, 0, 0))).toBe(false);
    expect(matches('0 0 29 2 *', at(2025, 2, 28, 0, 0))).toBe(false);
  });

  it('3.3 RED: month boundary (Jan 31 target skips short February)', () => {
    expect(matches('0 0 31 * *', at(2026, 1, 31, 0, 0))).toBe(true);
    expect(matches('0 0 31 * *', at(2026, 2, 28, 0, 0))).toBe(false);
  });
});

describe('nextAfter', () => {
  it('3.3 RED: strictly after the given instant (same minute excluded)', () => {
    const next = nextAfter('30 4 * * *', at(2026, 9, 17, 4, 30));
    expect(next?.getTime()).toBe(at(2026, 9, 18, 4, 30).getTime());
  });

  it('3.3 RED: same day later minute', () => {
    const next = nextAfter('*/15 * * * *', at(2026, 9, 17, 12, 3));
    expect(next?.getTime()).toBe(at(2026, 9, 17, 12, 15).getTime());
  });

  it('3.3 RED: skips short months (Jan 31 cron → Mar 31, not Feb 31)', () => {
    const next = nextAfter('0 0 31 * *', at(2026, 1, 31, 0, 1));
    expect(next?.getTime()).toBe(at(2026, 3, 31, 0, 0).getTime());
  });

  it('3.3 RED: leap-day schedule lands on Feb 29 of the next leap year', () => {
    const next = nextAfter('0 0 29 2 *', at(2023, 6, 1, 0, 0));
    expect(next?.getTime()).toBe(at(2024, 2, 29, 0, 0).getTime());

    const afterThat = nextAfter('0 0 29 2 *', at(2024, 2, 29, 0, 0));
    expect(afterThat?.getTime()).toBe(at(2028, 2, 29, 0, 0).getTime());
  });

  it('3.3 RED: day-of-week-only schedule picks the next matching weekday', () => {
    // 2026-09-17 is a Thursday → next Monday is 2026-09-21.
    const next = nextAfter('0 12 * * 1', at(2026, 9, 17, 15, 0));
    expect(next?.getTime()).toBe(at(2026, 9, 21, 12, 0).getTime());
  });

  it('3.3 RED: year boundary', () => {
    const next = nextAfter('30 12 31 12 *', at(2025, 12, 31, 13, 0));
    expect(next?.getTime()).toBe(at(2026, 12, 31, 12, 30).getTime());
  });

  it('3.3 RED: sub-minute input is truncated then advanced one minute', () => {
    const next = nextAfter('* * * * *', new Date(2026, 8, 17, 10, 0, 30, 500));
    expect(next?.getTime()).toBe(at(2026, 9, 17, 10, 1).getTime());
  });

  it('3.3 RED: unrepresentable expression (Feb 31) yields null, never an infinite loop', () => {
    expect(nextAfter('0 0 31 2 *', at(2026, 1, 1, 0, 0))).toBeNull();
  });
});

describe('validation', () => {
  it('3.3 RED: valid expressions pass isValidCronExpr', () => {
    expect(isValidCronExpr('* * * * *')).toBe(true);
    expect(isValidCronExpr('0 4 * * 1-5')).toBe(true);
    expect(isValidCronExpr('0,30 4 */2 1 *')).toBe(true);
  });

  it('3.3 RED: invalid expressions fail isValidCronExpr', () => {
    expect(isValidCronExpr('61 * * * *')).toBe(false); // minute out of range
    expect(isValidCronExpr('* 25 * * *')).toBe(false); // hour out of range
    expect(isValidCronExpr('* * 0 * *')).toBe(false); // dom starts at 1
    expect(isValidCronExpr('* * * 13 *')).toBe(false); // month out of range
    expect(isValidCronExpr('* * * * 8')).toBe(false); // dow out of range
    expect(isValidCronExpr('1 2 3')).toBe(false); // too few fields
    expect(isValidCronExpr('1 2 3 4 5 6')).toBe(false); // too many fields
    expect(isValidCronExpr('a * * * *')).toBe(false); // non-numeric
    expect(isValidCronExpr('5-1 * * * *')).toBe(false); // inverted range
    expect(isValidCronExpr('*/0 * * * *')).toBe(false); // zero step
    expect(isValidCronExpr('')).toBe(false);
    expect(isValidCronExpr('   ')).toBe(false);
  });

  it('3.3 RED: matches and nextAfter throw InvalidCronError on garbage', () => {
    expect(() => matches('not a cron', at(2026, 1, 1))).toThrow(InvalidCronError);
    expect(() => nextAfter('61 * * * *', at(2026, 1, 1))).toThrow(InvalidCronError);
  });
});
