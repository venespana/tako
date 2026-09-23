// features/tasks/job-list/ui/JobListPane.tsx — the job list column (task 8.4).
// Owns the list cursor (up/k, down/j, Enter/l to select — dispatched by the
// shared useKeyBindings hook, 9.9) — a local cursor mirrors features/menu's
// useMenuList WITHOUT cross-importing the menu feature (FSD: same-layer
// cross-slice imports are forbidden, Strategy D not justified for a hook this
// small). Rows render through the job entity's JobRow.
import { useCallback, useState } from 'react';

import { Box, Text } from 'ink';

import type { JobView } from '../../../../../domains/agent/domain/types.js';
import { JobRow } from '../../../../entities/job/index.js';
import { useEditing } from '../../../../shared/lib/editing-context.js';
import { useKeyBindings } from '../../../../shared/lib/use-key-bindings.js';

export interface JobListPaneProps {
  readonly jobs: readonly JobView[];
  readonly onSelect: (jobId: string) => void;
}

export function JobListPane({ jobs, onSelect }: JobListPaneProps): React.ReactElement {
  const [cursor, setCursor] = useState(0);
  const { isEditing } = useEditing();

  const move = useCallback(
    (delta: number) => {
      setCursor(previous => {
        if (jobs.length === 0) return 0;
        return Math.min(jobs.length - 1, Math.max(0, previous + delta));
      });
    },
    [jobs.length]
  );

  useKeyBindings(
    {
      moveUp: () => move(-1),
      moveDown: () => move(1),
      confirm: () => {
        const focused = jobs[cursor];
        if (focused !== undefined) onSelect(focused.job.id);
      },
    },
    { isActive: !isEditing }
  );

  if (jobs.length === 0) {
    return (
      <Box flexDirection='column'>
        <Text dimColor>No jobs yet — press n to create one.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection='column'>
      {jobs.map((job, index) => (
        <JobRow key={job.job.id} job={job} focused={index === cursor} />
      ))}
    </Box>
  );
}
