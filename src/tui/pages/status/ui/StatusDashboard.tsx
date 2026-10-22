// StatusDashboard.tsx — The status screen's dashboard state: the stat strip
// (STACKS / RUNNING / STOPPED — paused counts as stopped), the stack table
// (cursor column, health-colored status, dim config files) and the
// right-hand detail column mirroring the focused stack. Pure renderer — the
// focused stack arrives from the page (its useMenuList cursor), selection
// itself is intentionally inert (Enter/l is a no-op on this screen).
import { useMemo } from 'react';

import { Box, Text } from 'ink';

import type { StackStatusEntry } from '../../../../services/docker.js';
import { theme } from '../../../shared/ui/theme.js';
import { classifyStackHealth, computeStatusStats, healthColor } from '../model/stack-status-view.js';

export interface StatusDashboardProps {
  /** The fetched stacks, in service order. */
  entries: readonly StackStatusEntry[];
  /** When the listing was fetched (meta line clock). */
  fetchedAt: Date;
  /** Name of the focused stack (page-owned cursor); undefined → no cursor. */
  focusedName: string | undefined;
}

const COLUMN_GAP = 3;
const STAT_COLUMN_WIDTH = 12;
const CURSOR_COLUMN = '  ';

/** 24h local HH:MM for the meta line. */
function formatClock(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');

  return `${hh}:${mm}`;
}

export function StatusDashboard({ entries, fetchedAt, focusedName }: StatusDashboardProps): React.ReactElement {
  const stats = useMemo(() => computeStatusStats(entries), [entries]);

  // Column widths follow the data so rows align like the mock's table.
  const nameWidth = useMemo(() => Math.max('NAME'.length, ...entries.map(entry => entry.name.length)), [entries]);
  const statusWidth = useMemo(() => Math.max('STATUS'.length, ...entries.map(entry => entry.status.length)), [entries]);

  const selected = useMemo(
    () => (focusedName === undefined ? undefined : entries.find(entry => entry.name === focusedName)),
    [entries, focusedName]
  );

  return (
    <Box flexDirection='column' alignItems='flex-start'>
      <Text bold>Status</Text>
      <Text dimColor>
        {stats.total} stacks · updated {formatClock(fetchedAt)}
      </Text>

      {/* Stat strip: value over dim label, one column per bucket. */}
      <Box flexDirection='row' marginTop={1}>
        <Box width={STAT_COLUMN_WIDTH} flexDirection='column'>
          <Text>{stats.total}</Text>
          <Text dimColor>STACKS</Text>
        </Box>
        <Box width={STAT_COLUMN_WIDTH} flexDirection='column'>
          <Text color='green'>{stats.running}</Text>
          <Text dimColor>RUNNING</Text>
        </Box>
        <Box width={STAT_COLUMN_WIDTH} flexDirection='column'>
          <Text color='red'>{stats.stopped}</Text>
          <Text dimColor>STOPPED</Text>
        </Box>
      </Box>

      {/* Table + detail side by side; Ink wraps on narrow terminals. */}
      <Box flexDirection='row' gap={COLUMN_GAP} marginTop={1}>
        <Box flexDirection='column'>
          <Text dimColor>
            {CURSOR_COLUMN}
            {'NAME'.padEnd(nameWidth)} {'STATUS'.padEnd(statusWidth)} CONFIG FILES
          </Text>
          {entries.map(entry => {
            const focused = entry.name === focusedName;
            const color = healthColor(classifyStackHealth(entry.status));

            return (
              <Text key={entry.name}>
                <Text color={focused ? theme.cursorColor : undefined}>{focused ? theme.cursorGlyph : ' '}</Text>
                <Text> {entry.name.padEnd(nameWidth)}</Text>
                <Text color={color}> {entry.status.padEnd(statusWidth)}</Text>
                <Text dimColor> {entry.configFiles}</Text>
              </Text>
            );
          })}
        </Box>

        {selected && (
          <Box flexDirection='column'>
            <Text bold>{selected.name}</Text>
            <Text>
              <Text dimColor>STATUS </Text>
              <Text color={healthColor(classifyStackHealth(selected.status))}>{selected.status}</Text>
            </Text>
            <Text>
              <Text dimColor>CONFIG </Text>
              <Text dimColor>{selected.configFiles}</Text>
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
