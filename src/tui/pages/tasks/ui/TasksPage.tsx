// pages/tasks/ui/TasksPage.tsx — The per-server tasks workspace (task 8.11).
// Layout: job list (left) + detail pane (right) under an agent header; the
// install panel replaces the workspace when the agent is unreachable (9.14b:
// in-TUI install with live output, retry on failure, reconnect on success).
// All state lives in the job-list store; the page only composes slices and
// wires the explicit actions. Editing the form suspends page hotkeys via
// EditingGuard. All deps arrive as props from the route shim (pages never
// import app/, per FSD).
//
// 9.15a: the page publishes its key hints to the FOOTER (shared page-hints
// context) instead of printing them in the body; 9.15c: while a form is open
// the page publishes NO char hints — character keys are data entry only and
// Esc is the only cancel.
// 9.16: the workspace RULES (mode machine, hotkeys + gating, install
// auto-start-once, hints) live in the features layer — useTasksWorkspace —
// leaving this page pure composition: early returns, panes, layout.
import { useCallback, useEffect } from 'react';

import { Box, Text } from 'ink';

import { formatSchedule } from '../../../entities/job/index.js';
import { DryRunPreviewPane } from '../../../features/tasks/dry-run-preview/index.js';
import { AgentInstallPanel, type InstallRunner } from '../../../features/tasks/install/index.js';
import { EMPTY_JOB_FORM, JobForm, jobToForm } from '../../../features/tasks/job-form/index.js';
import { JobHistoryPane } from '../../../features/tasks/job-history/index.js';
import { JobListPane, useTasksStore } from '../../../features/tasks/job-list/index.js';
import type { TasksGateway } from '../../../features/tasks/job-list/index.js';
import { useTasksWorkspace } from '../../../features/tasks/workspace/index.js';

export interface TasksPageProps {
  /** Composition-root gateway for the active remote (null → select hint). */
  readonly gateway: TasksGateway | null;
  /**
   * Publishes the handshake's agent version to the app runtime so the shell
   * header can show it (9.14a). Injected by the route shim.
   */
  readonly onAgentVersion?: (version: string) => void;
}

export function TasksPage({ gateway, onAgentVersion }: TasksPageProps): React.ReactElement {
  const status = useTasksStore(state => state.status);
  const message = useTasksStore(state => state.message);
  const agent = useTasksStore(state => state.agent);
  const jobs = useTasksStore(state => state.jobs);
  const selectedJobId = useTasksStore(state => state.selectedJobId);
  const historyByJob = useTasksStore(state => state.historyByJob);
  const select = useTasksStore(state => state.select);
  const remove = useTasksStore(state => state.remove);
  const trigger = useTasksStore(state => state.trigger);
  const upsert = useTasksStore(state => state.upsert);
  // 9.21: actions come from selector hooks (zustand actions are
  // identity-stable) — components use hooks, never getState().
  const connect = useTasksStore(state => state.connect);
  const disconnect = useTasksStore(state => state.disconnect);

  // Connect on mount, disconnect on unmount (session lifetime == page life).
  useEffect(() => {
    if (gateway === null) return;
    void connect(gateway);
    return () => {
      void disconnect();
    };
  }, [gateway, connect, disconnect]);

  // 9.14a: the handshake's agent version rides up to the shell header.
  const publishAgentVersion = useCallback((version: string) => onAgentVersion?.(version), [onAgentVersion]);
  useEffect(() => {
    if (agent !== null) publishAgentVersion(agent.agentVersion);
  }, [agent, publishAgentVersion]);

  // First job becomes the detail pane's subject as soon as jobs arrive.
  useEffect(() => {
    if (selectedJobId === null && jobs.length > 0) {
      select(jobs[0]?.job.id ?? null);
    }
  }, [jobs, selectedJobId, select]);

  const selected = jobs.find(view => view.job.id === selectedJobId) ?? null;
  const runs = selectedJobId !== null ? (historyByJob[selectedJobId] ?? []) : [];
  // The preview shows the MOST RECENT dry-run — including queued ones, which
  // resolve their report through push events without any user action. This
  // is also the reviewed-report the feature's apply gating (`a`) requires.
  const latestDryRun = runs.find(run => run.mode === 'dry-run') ?? null;

  // Workspace rules (mode machine, hotkeys, apply gating, footer hints) are
  // the feature's; the page injects the store bits they gate on.
  const workspace = useTasksWorkspace({
    status,
    hasGateway: gateway !== null,
    selected,
    latestDryRun,
    removeJob: remove,
    triggerJob: trigger,
    upsertJob: upsert,
  });

  // 9.14b reconnect: a fresh handshake over a NEW connection (the gateway
  // builds a fresh SSH stack per connect call).
  const handleInstalled = useCallback(() => {
    if (gateway !== null) void connect(gateway);
  }, [gateway, connect]);

  // 9.19: the install runs IN-PROCESS through the gateway (the shim composes
  // the shared agent pipeline over the same SSH stack) — the panel only sees
  // this stable runner, never the session material behind it.
  const install = useCallback<InstallRunner>(
    onLine => {
      if (gateway === null) return Promise.resolve({ ok: false, error: 'no remote selected' });
      return gateway.install(onLine);
    },
    [gateway]
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
        <AgentInstallPanel
          remote={gateway.remote}
          error={message}
          autoStart={!workspace.installStarted}
          onStart={workspace.noteInstallStart}
          onInstalled={handleInstalled}
          install={install}
        />
      </Box>
    );
  }

  if (workspace.mode !== 'browse') {
    return (
      <Box flexDirection='column' paddingLeft={2}>
        <Box height={1} />
        <JobForm
          initial={workspace.mode === 'edit' && selected !== null ? jobToForm(selected.job) : EMPTY_JOB_FORM}
          onCancel={workspace.cancelForm}
          onSubmit={job => {
            workspace.submitForm(job);
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
