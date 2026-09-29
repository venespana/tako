// features/tasks/dry-run-preview/ui/DryRunPreviewPane.tsx — dry-run preview
// slice (task 8.10). Pure renderer over the model's summary. This slice NEVER
// applies anything: the explicit Apply action is wired by the page as a
// separate key (spec tui-tasks#Dry-Run-Preview — apply is separate and
// explicit, never a side effect of previewing).
import { Box, Text } from 'ink';

import type { RunView } from '../../../../../domains/agent/domain/types.js';
import { summarizeDryRun } from '../model/dry-run-preview.js';

export interface DryRunPreviewPaneProps {
  /** The most recent dry-run for the selected job (null when none). */
  readonly run: RunView | null;
}

export function DryRunPreviewPane({ run }: DryRunPreviewPaneProps): React.ReactElement {
  if (run === null) {
    return (
      <Box flexDirection='column'>
        {/* 9.15a: the trigger hint (r dry-run) lives in the footer. */}
        <Text dimColor>No dry-run yet for this job.</Text>
      </Box>
    );
  }

  const summary = summarizeDryRun(run);

  return (
    <Box flexDirection='column'>
      <Text bold>{summary.headline}</Text>
      {summary.lines.map(line => (
        <Text key={line} dimColor>
          {' '}
          {line}
        </Text>
      ))}
      <Text> </Text>
      <Text dimColor>applying is a separate, explicit action — review this report first</Text>
    </Box>
  );
}
