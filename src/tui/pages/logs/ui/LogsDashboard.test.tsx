// LogsDashboard.test.tsx — Unit tests for the logs dashboard view
// (tui-live-logs T7 viewport window; window helper unit tests in T8): the
// frame never exceeds the terminal — with a mocked stdout.rows the dashboard
// renders ONLY the last `windowSize` rows of the ring (the newest tail,
// oldest→newest), a new line always lands as the LAST row of the frame
// (append-at-bottom), and the title/meta/status block sits ABOVE the rows
// like every other page. Blank lines keep their spacer rows, and a stdout
// without `rows` (tests, non-TTY) still gets a bounded window through the
// fallback. `visibleRowCount` (the window computation, T8 C2) is unit-tested
// directly: fallback, floor, ceiling, and a mid value.
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { LogsDashboard, visibleRowCount } from './LogsDashboard.js';

/** Distinct, non-substring-colliding row markers (3-digit padding). */
const linesOf = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `row-${String(index).padStart(3, '0')}`);

/** The testing-library stdout has no `rows` property (non-TTY); inject one —
 * the dashboard re-reads it on the next render pass. */
const mockRows = (stdout: ReturnType<typeof render>['stdout'], rows: number): void => {
  Object.defineProperty(stdout, 'rows', { value: rows, configurable: true });
};

/** Last non-empty line of a captured frame (the frame's bottom row). */
const bottomRowOf = (frame: string): string => frame.trimEnd().split('\n').at(-1) ?? '';

describe('LogsDashboard', () => {
  it('renders only the last windowSize rows of a 600-line ring (mocked stdout.rows)', () => {
    const instance = render(<LogsDashboard container='web-1' remote='nas' phase='streaming' lines={linesOf(600)} />);

    // 24 terminal rows − 14 chrome rows = a 10-row window: rows 590–599.
    mockRows(instance.stdout, 24);
    instance.rerender(<LogsDashboard container='web-1' remote='nas' phase='streaming' lines={linesOf(600)} />);

    const frame = instance.lastFrame() ?? '';
    const rendered = linesOf(600).filter(line => frame.includes(line));

    expect(rendered).toHaveLength(10);
    expect(frame).not.toContain('row-589');
    Array.from({ length: 10 }, (_, index) => index).forEach(index => {
      expect(frame).toContain(`row-${String(590 + index).padStart(3, '0')}`);
    });
    instance.unmount();
  });

  it('always renders the newest line as the bottom row of the frame (append-at-bottom)', () => {
    const instance = render(<LogsDashboard container='web-1' remote='nas' phase='streaming' lines={linesOf(3)} />);

    expect(bottomRowOf(instance.lastFrame() ?? '')).toBe('row-002');

    // New lines arrive: the frame grows downward, the newest stays last.
    instance.rerender(<LogsDashboard container='web-1' remote='nas' phase='streaming' lines={linesOf(6)} />);
    expect(bottomRowOf(instance.lastFrame() ?? '')).toBe('row-005');

    // The ring slid (head dropped, tail appended): the newest is STILL last.
    instance.rerender(<LogsDashboard container='web-1' remote='nas' phase='streaming' lines={linesOf(6).slice(2)} />);
    const frame = instance.lastFrame() ?? '';

    expect(frame).not.toContain('row-001');
    expect(bottomRowOf(frame)).toBe('row-005');
    instance.unmount();
  });

  it('renders the title, meta and status ABOVE the log rows (top layout like the rest of the app)', () => {
    const { lastFrame, unmount } = render(
      <LogsDashboard container='web-1' remote='nas' phase='streaming' lines={linesOf(3)} />
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('logs');
    expect(frame).toContain('web-1 · nas');
    expect(frame).toContain('● streaming');
    expect(frame).toContain('row-000');
    expect(frame.indexOf('logs')).toBeLessThan(frame.indexOf('row-000'));
    unmount();
  });

  it('renders blank lines as spacer rows inside the window', () => {
    const { lastFrame, unmount } = render(
      <LogsDashboard container='web-1' remote='nas' phase='ended' lines={['top', '', 'bottom']} />
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('top');
    expect(frame).toContain('bottom');

    // The blank middle line still occupies its row — the frame capture
    // trims the spacer to an empty line, but the row itself is there
    // (dropping it would collapse to a single newline).
    expect(frame).toContain('top\n\nbottom');
    unmount();
  });

  it('falls back to a bounded window when stdout.rows is undefined (non-TTY)', () => {
    const { lastFrame, unmount } = render(
      <LogsDashboard container='web-1' remote='nas' phase='streaming' lines={linesOf(600)} />
    );

    const frame = lastFrame() ?? '';
    const rendered = linesOf(600).filter(line => frame.includes(line));

    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(600);
    expect(frame).toContain('row-599');
    unmount();
  });
});

describe('visibleRowCount', () => {
  it('uses the fallback window when stdout reports no rows (non-TTY)', () => {
    // 30 fallback rows − 14 chrome rows = 16, inside the bounds.
    expect(visibleRowCount(undefined)).toBe(16);
  });

  it('clamps to the floor on short terminals', () => {
    expect(visibleRowCount(24)).toBe(10);
    expect(visibleRowCount(5)).toBe(10);
  });

  it('clamps to the ceiling on tall terminals', () => {
    expect(visibleRowCount(200)).toBe(60);
  });

  it('subtracts the chrome rows for a mid-range terminal', () => {
    expect(visibleRowCount(40)).toBe(26);
  });
});
