// features/tasks/job-history/ui/JobHistoryPane.tsx — per-job history column
// (task 8.8). Renders the store's run views (already reconciled + live) as
// rows: glyph, seq, mode, catchup marker, outcome summary. Runs that executed
// while the client was disconnected appear exactly like any other run.
import { Box, Text } from 'ink';

import type { RunView } from '../../../../../domains/agent/domain/types.js';
import { toHistoryRows } from '../model/job-history.js';

export interface JobHistoryPaneProps {
  readonly runs: readonly RunView[];
}

export function JobHistoryPane({ runs }: JobHistoryPaneProps): React.ReactElement {
  const rows = toHistoryRows(runs);

  if (rows.length === 0) {
    return (
      <Box flexDirection='column'>
        <Text dimColor>No runs yet.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection='column'>
      {rows.map(row => (
        <Text key={row.id}>
          <Text color={row.style.color}>{row.style.glyph}</Text>
          <Text> #{row.seq}</Text>
          <Text dimColor> {row.mode}</Text>
          {row.catchup && <Text color='yellow'> catch-up</Text>}
          <Text> {row.outcome}</Text>
        </Text>
      ))}
    </Box>
  );
}
