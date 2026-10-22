// pages/tasks/ui/JobListPane.tsx — the job list column (task 8.4).
// Owns the list cursor (up/k, down/j, Enter/l to select — dispatched by the
// shared useKeyBindings hook, 9.9) — a local cursor mirrors features/menu's
// useMenuList rather than importing the hook (one state value does not
// justify the dependency). Rows render through the job entity's JobRow.
import { useCallback, useState } from 'react';

import { Box, Text } from 'ink';

import type { JobView } from '../../../../services/agent.js';
import { JobRow } from '../../../entities/job/index.js';
import { useEditingStore } from '../../../shared/lib/editing-store.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';

export interface JobListPaneProps {
  readonly jobs: readonly JobView[];
  readonly onSelect: (jobId: string) => void;
}

export function JobListPane({ jobs, onSelect }: JobListPaneProps): React.ReactElement {
  const [cursor, setCursor] = useState(0);
  const isEditing = useEditingStore(state => state.isEditing);

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
        {/* 9.15a: the create hint (n new) lives in the footer. */}
        <Text dimColor>No jobs yet.</Text>
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
