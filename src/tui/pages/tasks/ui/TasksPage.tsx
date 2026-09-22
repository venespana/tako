// pages/tasks/ui/TasksPage.tsx — The per-server tasks workspace (task 8.11).
// Layout: job list (left) + detail pane (right) under an agent header; the
// install hint replaces the workspace when the agent is unreachable. All
// state lives in the job-list store; the page only composes slices and wires
// the explicit actions (create n / edit e / delete d / dry-run r / apply t /
// apply-after-preview a). Editing the form suspends page hotkeys via
// EditingGuard. All deps arrive as props from the route shim (pages never
// import app/, per FSD).
import { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { formatSchedule } from '../../../entities/job/index.js';
import { DryRunPreviewPane } from '../../../features/tasks/dry-run-preview/index.js';
import { EMPTY_JOB_FORM, JobForm, jobToForm } from '../../../features/tasks/job-form/index.js';
import { JobHistoryPane } from '../../../features/tasks/job-history/index.js';
import { JobListPane, useTasksStore } from '../../../features/tasks/job-list/index.js';
import type { TasksGateway } from '../../../features/tasks/job-list/index.js';

export interface TasksPageProps {
  /** Composition-root gateway for the active remote (null → select hint). */
  readonly gateway: TasksGateway | null;
}

type Mode = 'browse' | 'create' | 'edit';

export function TasksPage({ gateway }: TasksPageProps): React.ReactElement {
  const status = useTasksStore(state => state.status);
  const message = useTasksStore(state => state.message);
  const agent = useTasksStore(state => state.agent);
  const jobs = useTasksStore(state => state.jobs);
  const selectedJobId = useTasksStore(state => state.selectedJobId);
  const historyByJob = useTasksStore(state => state.historyByJob);
  const select = useTasksStore(state => state.select);
  const remove = useTasksStore(state => state.remove);
  const trigger = useTasksStore(state => state.trigger);

  // Connect on mount, disconnect on unmount (session lifetime == page life).
  useEffect(() => {
    if (gateway === null) return;
    void useTasksStore.getState().connect(gateway);
    return () => {
      void useTasksStore.getState().disconnect();
    };
  }, [gateway]);

  // First job becomes the detail pane's subject as soon as jobs arrive.
  useEffect(() => {
    if (selectedJobId === null && jobs.length > 0) {
      select(jobs[0]?.job.id ?? null);
    }
  }, [jobs, selectedJobId, select]);

  const [mode, setMode] = useState<Mode>('browse');
  const selected = jobs.find(view => view.job.id === selectedJobId) ?? null;
  const runs = selectedJobId !== null ? (historyByJob[selectedJobId] ?? []) : [];
  // The preview shows the MOST RECENT dry-run — including queued ones, which
  // resolve their report through push events without any user action.
  const latestDryRun = runs.find(run => run.mode === 'dry-run') ?? null;

  useInput(
    (input, key) => {
      if (key.escape) return; // global back navigation owns Esc in browse mode
      if (input === 'n') setMode('create');
      else if (input === 'e' && selected !== null) setMode('edit');
      else if (input === 'd' && selected !== null) void remove(selected.job.id);
      else if (input === 'r' && selected !== null) void trigger(selected.job.id, 'dry-run');
      else if (input === 'a' && selected !== null && latestDryRun !== null) {
        // Explicit, separate apply — only meaningful after a reviewed report.
        void trigger(selected.job.id, 'apply');
      } else if (input === 't' && selected !== null) void trigger(selected.job.id, 'apply');
    },
    { isActive: mode === 'browse' }
  );

  if (gateway === null) {
    return (
      <Box flexDirection='column' paddingLeft={2}>
        <Box height={2} />
        <Text>No remote selected — pick one under remotes first.</Text>
      </Box>
    );
  }

  if (status === 'idle' || status === 'connecting') {
    return (
      <Box flexDirection='column' paddingLeft={2}>
        <Box height={2} />
        <Text dimColor>Connecting to the agent on {gateway.remote}…</Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection='column' paddingLeft={2}>
        <Box height={2} />
        <Text color='red'>
          Agent unreachable on {gateway.remote}: {message ?? 'unknown error'}
        </Text>
        <Box height={1} />
        <Text>Is the agent installed? From a terminal run:</Text>
        <Text bold> tako agent install {gateway.remote}</Text>
      </Box>
    );
  }

  if (mode !== 'browse') {
    return (
      <Box flexDirection='column' paddingLeft={2}>
        <Box height={1} />
        <JobForm
          initial={mode === 'edit' && selected !== null ? jobToForm(selected.job) : EMPTY_JOB_FORM}
          onCancel={() => setMode('browse')}
          onSubmit={job => {
            void useTasksStore
              .getState()
              .upsert(job)
              .then(() => setMode('browse'));
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection='column' paddingLeft={2}>
      <Box height={1} />
      {/* Agent header */}
      {agent !== null && (
        <Text dimColor>
          agent {agent.agentVersion} · unit {agent.unitState} · linger {agent.linger ? 'on' : 'off'}
          {agent.lingerByTako ? ' (by tako)' : ''} · {jobs.length} job(s)
        </Text>
      )}
      {status === 'warning' && <Text color='yellow'>warning: {message ?? 'version mismatch'}</Text>}

      <Box flexDirection='row' gap={2}>
        {/* Left: job list */}
        <Box flexDirection='column' width='48%'>
          <Text bold>Jobs</Text>
          <JobListPane jobs={jobs} onSelect={select} />
        </Box>

        {/* Right: detail pane */}
        <Box flexDirection='column' flexGrow={1}>
          {selected === null ? (
            <Text dimColor>Select a job to see details.</Text>
          ) : (
            <>
              <Text bold>{selected.job.id}</Text>
              <Text dimColor>
                {formatSchedule(selected.job.schedule)}
                {selected.enabled ? '' : ' · paused'}
              </Text>
              <Box height={1} />
              <Text dimColor>n new · e edit · d delete · r dry-run · t apply</Text>
              <Box height={1} />
              <Text bold>History</Text>
              <JobHistoryPane runs={runs} />
              <Box height={1} />
              <Text bold>Dry-run preview</Text>
              <DryRunPreviewPane run={latestDryRun} />
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
