// pages/tasks/model/use-tasks-workspace.ts — The tasks workspace RULES
// (9.16): the mode machine (browse/create/edit), the page hotkeys with their
// business gating, the apply-after-reviewed-report rule, and the
// footer-hints computation. Formerly a feature slice (9.16); absorbed into
// the page's model segment by ADR-0018's single-use rule — this page was its
// only consumer.
//
// The tasks STORE lives next door in model/tasks-store.ts: this hook
// receives the store-derived values and actions it gates on as injected deps
// from the page. Behavior contract: byte-identical to the pre-9.16 page —
// same keys, same guards, same hints, same action order.
import { useCallback, useMemo, useState } from 'react';

import type { JobDefinition, JobView, RunMode, RunView, Slug } from '../../../../services/agent.js';
import { usePageHints, type KeyHint } from '../../../shared/lib/page-hints-store.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';

/** Tasks-store status values the workspace rules gate on (job-list's union). */
export type TasksWorkspaceStatus = 'idle' | 'connecting' | 'ready' | 'warning' | 'error';

export type TasksWorkspaceMode = 'browse' | 'create' | 'edit';

/** Store-derived inputs the workspace rules gate on — injected by the page. */
export interface TasksWorkspaceDeps {
  readonly status: TasksWorkspaceStatus;
  /** False when no remote is selected (the select-a-remote state). */
  readonly hasGateway: boolean;
  /** The selected job view — edit/delete/dry-run/apply all gate on it. */
  readonly selected: JobView | null;
  /** Most recent dry-run of the selected job — `a` (apply) requires one. */
  readonly latestDryRun: RunView | null;
  readonly removeJob: (jobId: Slug) => Promise<boolean>;
  readonly triggerJob: (jobId: Slug, mode: RunMode) => Promise<RunView | null>;
  readonly upsertJob: (job: JobDefinition) => Promise<JobView | null>;
}

/** State + actions the page consumes to compose the workspace surface. */
export interface TasksWorkspace {
  readonly mode: TasksWorkspaceMode;
  /** 9.14b: true once the install panel started at least once this visit. */
  readonly installStarted: boolean;
  /** Record an install start (auto or retry) — flips autoStart off. */
  noteInstallStart(): void;
  /** Close the form without persisting (Esc). */
  cancelForm(): void;
  /** Persist the submitted job, then return to browse. */
  submitForm(job: JobDefinition): void;
}

/** Browse-mode footer hints, in declared display order (9.15a). */
const BROWSE_HINTS: readonly KeyHint[] = [
  { key: 'n', label: 'new' },
  { key: 'r', label: 'dry-run' },
  { key: 'a', label: 'apply' },
  { key: 'e', label: 'edit' },
  { key: 'd', label: 'delete' },
];

/** Install-panel state: the only live action is r (the panel re-runs it). */
const RETRY_HINTS: readonly KeyHint[] = [{ key: 'r', label: 'retry' }];

const NO_HINTS: readonly KeyHint[] = [];

/** Form mode publishes its own hints: chars are data entry, Esc cancels. */
const FORM_HINTS: readonly KeyHint[] = [
  { key: 'tab', label: 'fields' },
  { key: 'enter', label: 'submit' },
  { key: 'esc', label: 'cancel' },
];

export function useTasksWorkspace(deps: TasksWorkspaceDeps): TasksWorkspace {
  const { status, hasGateway, selected, latestDryRun, removeJob, triggerJob, upsertJob } = deps;

  const [mode, setMode] = useState<TasksWorkspaceMode>('browse');
  // 9.14b: the in-TUI install auto-runs once per page visit; every later
  // start (retry, or re-entry after a failed reconnect) is explicit.
  const [installStarted, setInstallStarted] = useState(false);

  // Page hotkeys as char bindings (9.9): guards live in each binding, Esc is
  // deliberately UNBOUND — global back navigation owns Esc in browse mode.
  //
  // 9.14e: gate on workspace VISIBILITY, not just the mode. The workspace is
  // only on screen for ready/warning; idle/connecting/error hide it behind
  // the page's early returns while this hook would still be active — a
  // keypress there silently flipped the hidden mode machine ("n" bricked:
  // inert for the rest of the visit, form never appearing). Key presses
  // against a hidden workspace must be a no-op, exactly like the unbound
  // case.
  const workspaceVisible = status === 'ready' || status === 'warning';
  useKeyBindings(
    {
      chars: {
        n: () => setMode('create'),
        e: () => {
          if (selected !== null) setMode('edit');
        },
        d: () => {
          if (selected !== null) void removeJob(selected.job.id);
        },
        r: () => {
          if (selected !== null) void triggerJob(selected.job.id, 'dry-run');
        },
        // Explicit, separate apply — only meaningful after a reviewed report.
        a: () => {
          if (selected !== null && latestDryRun !== null) void triggerJob(selected.job.id, 'apply');
        },
        t: () => {
          if (selected !== null) void triggerJob(selected.job.id, 'apply');
        },
      },
    },
    { isActive: mode === 'browse' && workspaceVisible }
  );

  // 9.15a/9.15c: this hook is the SINGLE hints writer for the whole page
  // surface — one publication per state, no parent/child effect-ordering
  // races. Browse advertises its actions; the install state advertises r
  // retry; form mode and the connecting/no-remote states advertise nothing
  // (while a form is open, character keys are data entry and Esc is the only
  // cancel).
  const pageHints = useMemo(() => {
    if (status === 'error') return RETRY_HINTS;
    if (mode !== 'browse') return FORM_HINTS;
    if (!workspaceVisible || !hasGateway) return NO_HINTS;
    return BROWSE_HINTS;
  }, [status, mode, workspaceVisible, hasGateway]);
  usePageHints(pageHints, mode !== 'browse');

  const noteInstallStart = useCallback(() => setInstallStarted(true), []);
  const cancelForm = useCallback(() => setMode('browse'), []);
  const submitForm = useCallback(
    (job: JobDefinition) => {
      void upsertJob(job).then(() => setMode('browse'));
    },
    [upsertJob]
  );

  return { mode, installStarted, noteInstallStart, cancelForm, submitForm };
}
