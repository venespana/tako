// LogsDashboard.tsx — The logs screen's live view (tui-live-logs T2; full
// window in T5, static stream in T6, viewport window in T7, window helper
// in T8): T6's <Static>
// let the frame grow past the terminal height and Ink's cursor math broke on
// every write (flicker, disappearing rows). T7 renders a VIEWPORT-BOUNDED
// window — always the LAST `windowSize` ring lines, oldest→newest, so new
// lines append at the bottom and the frame can never exceed the terminal:
// nothing left to flicker, scramble, or lose. The title/meta/status block
// returns to the TOP, matching the rest of the app's pages. The status line
// lookup stays a typed map of module constants — identity-stable across
// renders.
import { Box, Text, useStdout } from 'ink';

import type { LiveLogsState } from '../model/use-live-logs.js';

/** The phases the dashboard renders; the error phase has its own view. */
export type LogsDashboardPhase = Exclude<LiveLogsState['phase'], 'error'>;

/** Status line per phase (typed lookup, not a switch; module constants so
 * the elements are identity-stable across renders). */
const STATUS_LINE: Record<LogsDashboardPhase, React.ReactElement> = {
  connecting: <Text dimColor>● connecting</Text>,
  streaming: (
    <Text>
      <Text color='green'>●</Text>
      <Text color='cyan'>{' streaming'}</Text>
    </Text>
  ),
  ended: <Text dimColor>● ended</Text>,
};

/** Fixed rows that surround the window at runtime — AppShell's logo (6),
 * active-remote line (1), footer hints (1) and version bar (1), plus this
 * page's top spacer (2), title (1), meta (1) and status (1): 14 total.
 * Rendering `rows − CHROME_ROWS` log rows keeps title+meta+status+window
 * inside the shell's fixed-height viewport: on a 24-row terminal that is
 * exactly the 10-row floor below. */
const CHROME_ROWS = 14;

/** Window bounds: never fewer than 10 rows (a shorter terminal accepts a
 * slightly cropped tail over a useless sliver), never more than 60 (a huge
 * terminal does not need 190 rows of logs; the cap bounds re-render cost). */
const MIN_WINDOW = 10;
const MAX_WINDOW = 60;

/** Rows used when stdout does not report any (tests, pipes, non-TTY). */
const FALLBACK_ROWS = 30;

/** The viewport window's row count: stdout rows minus the chrome, clamped to
 * the window bounds; the fallback when stdout reports no rows. Exported for
 * direct unit tests. Single consumer today (this dashboard), so it stays in
 * this module rather than a speculative shared helper — promote it to
 * shared/ui when a second screen needs the same windowing (T8 C2). */
export const visibleRowCount = (stdoutRows: number | undefined): number =>
  Math.max(MIN_WINDOW, Math.min((stdoutRows ?? FALLBACK_ROWS) - CHROME_ROWS, MAX_WINDOW));

export interface LogsDashboardProps {
  readonly container: string;
  readonly remote: string;
  readonly phase: LogsDashboardPhase;
  readonly lines: readonly string[];
}

export function LogsDashboard({ container, remote, phase, lines }: LogsDashboardProps): React.ReactElement {
  const { stdout } = useStdout();
  const windowSize = visibleRowCount(stdout.rows);
  // The ring's tail: oldest→newest, so a new line always lands at the
  // bottom of the frame — the append-at-bottom semantics the static stream
  // was drafted for, without the unbounded frame.
  const visible = lines.slice(-windowSize);

  return (
    <Box flexDirection='column' alignItems='flex-start' width='100%'>
      <Text bold>logs</Text>
      <Text dimColor>{`${container} · ${remote}`}</Text>
      {STATUS_LINE[phase]}
      {visible.map((line, index) => (
        // Index keys are honest here (T7): the window is a PURE SLICE of an
        // append-only log — lines are immutable, the list only shifts by
        // dropping its head, and no row is ever reordered or mutated, so
        // index i always names "the i-th visible row".
        <Text key={index}>{line === '' ? ' ' : line}</Text>
      ))}
    </Box>
  );
}
