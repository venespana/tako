// pages/tasks/ui/TasksPage.tsx — The per-server tasks workspace (task 8.11).
// Layout: job list (left) + detail pane (right) under an agent header; the
// install panel replaces the workspace when the agent is unreachable (9.14b:
// in-TUI install with live output, retry on failure, reconnect on success).
// All state lives in the page's tasks store (model/tasks-store); the
// component only composes panes and wires the explicit actions. Editing the
// form suspends page hotkeys via EditingGuard. Since ADR-0019 the page
// imports the services layer DIRECTLY (no injected gateway): the route shim
// hands over plain data — the remote name and its session password — and the
// transport, the install pipeline, and the cursor live behind services/agent.
//
// 9.15a: the page publishes its key hints to the FOOTER (shared page-hints
// context) instead of printing them in the body; 9.15c: while a form is open
// the page publishes NO char hints — character keys are data entry only and
// Esc is the only cancel.
// 9.16: the workspace RULES (mode machine, hotkeys + gating, install
// auto-start-once, hints) live in the page's model segment —
// useTasksWorkspace — leaving this component pure composition: early
// returns, panes, layout.
import { useCallback, useEffect } from 'react';

import { Box, Text } from 'ink';

import { AgentInstallPanel } from './AgentInstallPanel.js';
import { DryRunPreviewPane } from './DryRunPreviewPane.js';
import { JobForm } from './JobForm.js';
import { JobHistoryPane } from './JobHistoryPane.js';
import { JobListPane } from './JobListPane.js';
import { installAgent } from '../../../../services/agent.js';
import { formatSchedule } from '../../../entities/job/index.js';
import { EMPTY_JOB_FORM, jobToForm } from '../model/job-form.js';
import { useTasksStore } from '../model/tasks-store.js';
import type { InstallOutcome, InstallRunner } from '../model/use-agent-install.js';
import { useTasksWorkspace } from '../model/use-tasks-workspace.js';

export interface TasksPageProps {
  /** The active remote (null → select hint). Plain data — the route's whole job. */
  readonly remote: string | null;
  /** Session password for interactive-credential remotes (captured at activation). */
  readonly sessionPassword?: string;
  /**
   * Publishes the handshake's agent version to the app runtime so the shell
   * header can show it (9.14a). Injected by the route shim.
   */
  readonly onAgentVersion?: (version: string) => void;
}

export function TasksPage({ remote, sessionPassword, onAgentVersion }: TasksPageProps): React.ReactElement {
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
    if (remote === null) return;

    void connect({ remote, sessionPassword });
    return () => {
      void disconnect();
    };
  }, [remote, sessionPassword, connect, disconnect]);

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
  // is also the reviewed-report the workspace's apply gating (`a`) requires.
  const latestDryRun = runs.find(run => run.mode === 'dry-run') ?? null;

  // Workspace rules (mode machine, hotkeys, apply gating, footer hints) are
  // the model's; the component injects the store bits they gate on.
  const workspace = useTasksWorkspace({
    status,
    hasGateway: remote !== null,
    selected,
    latestDryRun,
    removeJob: remove,
    triggerJob: trigger,
    upsertJob: upsert,
  });

  // 9.14b reconnect: a fresh handshake over a NEW connection (the service
  // resolves the remote fresh and builds a fresh SSH stack per connect).
  const handleInstalled = useCallback(() => {
    if (remote !== null) void connect({ remote, sessionPassword });
  }, [remote, sessionPassword, connect]);

  // 9.19: the install runs IN-PROCESS through the service (the shared agent
  // pipeline over the same SSH stack) — the panel only sees this stable
  // runner, never the session material behind it.
  const install = useCallback<InstallRunner>(
    async (onLine): Promise<InstallOutcome> => {
      if (remote === null) return { ok: false, error: 'no remote selected' };

      const result = await installAgent({ remote, sessionPassword, onLine });

      switch (result.kind) {
        case 'installed':
          return { ok: true };
        case 'refused':
          return { ok: false, error: result.reason };
        case 'failed':
          return { ok: false, error: result.error };
      }
    },
    [remote, sessionPassword]
  );

  if (remote === null) {
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
        <Text dimColor>Connecting to the agent on {remote}…</Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection='column' paddingLeft={2}>
        <Box height={2} />
        <AgentInstallPanel
          remote={remote}
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
