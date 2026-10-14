// pages/tasks/model/tasks-store.ts — Zustand store for the tasks
// workspace (task 8.3, design §TUI Layout).
//
// ONE store per session: connect() opens a long-lived agent session for the
// active remote, seeds state from reconcile.sync (full jobs + runs newer than
// the persisted per-remote cursor), subscribes to push events, and then every
// CRUD action goes through the SAME typed protocol session. Push events
// (job.state_changed / run.completed / protocol.warning) patch the store live
// — history reflects runs that completed while the client was disconnected
// because reconcile redelivers them and the merge is idempotent by run id.
//
// Since ADR-0019 the store is VIEW state: the transport comes from the
// services layer (services/agent), imported directly — there is no injected
// gateway and no infrastructure composition on this side of the fence. The
// reconcile cursor is persisted per remote through the service (conf on the
// services side).
import { create } from 'zustand';

import { connectAgentSession, loadReconcileCursor, saveReconcileCursor } from '../../../../services/agent.js';
import type {
  AgentFrame,
  JobStateChangedPayload,
  RunCompletedPayload,
  AgentSession,
  JobDefinition,
  JobView,
  RunMode,
  RunView,
  Slug,
} from '../../../../services/agent.js';

export type TasksStatus = 'idle' | 'connecting' | 'ready' | 'warning' | 'error';

/** agent.status projection the workspace header renders. */
export interface TasksAgentInfo {
  readonly agentVersion: string;
  readonly unitState: string;
  readonly linger: boolean;
  readonly lingerByTako: boolean;
}

/** Identifies the remote to bind the workspace to (session material rides along). */
export interface TasksConnectRequest {
  readonly remote: string;
  readonly sessionPassword?: string;
}

export interface TasksState {
  status: TasksStatus;
  /** Warning/error detail (handshake warning, request failure, disconnect). */
  message: string | null;
  agent: TasksAgentInfo | null;
  jobs: JobView[];
  selectedJobId: Slug | null;
  /** run views per job id, newest first. */
  historyByJob: Record<string, RunView[]>;
  /** Reconcile cursor: max run seq this client has SEEN (responses only). */
  lastSeq: number;
}

export interface TasksActions {
  reset(): void;
  /** Connect + reconcile for the given remote; resolves false on failure. */
  connect(request: TasksConnectRequest): Promise<boolean>;
  /** Close the session and drop all state. */
  disconnect(): Promise<void>;
  refresh(): Promise<boolean>;
  select(jobId: Slug | null): void;
  /** Persist a job (create or edit — idempotent by id); resolves the view. */
  upsert(job: JobDefinition): Promise<JobView | null>;
  /** Delete a job; resolves whether the server confirmed it. */
  remove(jobId: Slug): Promise<boolean>;
  /** Queue a run via jobs.trigger; the queued run lands in history. */
  trigger(jobId: Slug, mode: RunMode): Promise<RunView | null>;
  /** Fetch a job's run history and merge it into the store. */
  loadHistory(jobId: Slug): Promise<RunView[]>;
}

export type TasksStore = TasksState & TasksActions;

export const initialTasksState: TasksState = {
  status: 'idle',
  message: null,
  agent: null,
  jobs: [],
  selectedJobId: null,
  historyByJob: {},
  lastSeq: 0,
};

// ---------------------------------------------------------------------------
// Pure reconcile/push helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Merge run views idempotently by id (server truth replaces the local copy),
 * newest first. Reconcile redelivery after reconnect must never duplicate.
 */
export function mergeRuns(existing: readonly RunView[], incoming: readonly RunView[]): RunView[] {
  const byId = new Map<string, RunView>();
  for (const run of existing) byId.set(run.id, run);
  for (const run of incoming) byId.set(run.id, run);
  return [...byId.values()].sort((a, b) => b.seq - a.seq);
}

/** Patch a single run in place; unknown run ids are ignored (never fabricated). */
function patchRun(
  historyByJob: Record<string, RunView[]>,
  jobId: Slug,
  runId: string,
  patch: Partial<RunView>
): Record<string, RunView[]> {
  const runs = historyByJob[jobId];
  if (runs === undefined) return historyByJob;
  const index = runs.findIndex(run => run.id === runId);
  if (index === -1) return historyByJob;
  const updated = runs.map((run, at) => (at === index ? { ...run, ...patch } : run));
  return { ...historyByJob, [jobId]: updated };
}

/** job.state_changed push: advance the status; terminal states stamp finishedAt. */
export function applyJobStateChanged(
  historyByJob: Record<string, RunView[]>,
  payload: JobStateChangedPayload
): Record<string, RunView[]> {
  const terminal = payload.to !== 'pending' && payload.to !== 'running';
  return patchRun(historyByJob, payload.jobId, payload.runId, {
    status: payload.to,
    ...(terminal && { finishedAt: payload.at }),
  });
}

/** run.completed push: record the terminal status + result. */
export function applyRunCompleted(
  historyByJob: Record<string, RunView[]>,
  payload: RunCompletedPayload
): Record<string, RunView[]> {
  return patchRun(historyByJob, payload.jobId, payload.runId, {
    status: payload.status,
    ...(payload.result !== undefined && { result: payload.result }),
  });
}

// ---------------------------------------------------------------------------
// Store (module-level singleton — one tasks workspace per session, like the
// add-remote wizard; reset() gives tests and route remounts a clean slate)
// ---------------------------------------------------------------------------

let activeRemote: string | null = null;
let activeSession: AgentSession | null = null;
let unsubscribe: (() => void) | null = null;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useTasksStore = create<TasksStore>((set, get) => ({
  ...initialTasksState,

  reset: () => {
    activeRemote = null;
    void get().disconnect();
    set({ ...initialTasksState });
  },

  connect: async request => {
    set({ status: 'connecting', message: null });
    let session: AgentSession;
    try {
      const result = await connectAgentSession(request);
      if (result.kind === 'refused') {
        set({ status: 'error', message: result.reason });
        return false;
      }
      session = result.session;
    } catch (error) {
      set({ status: 'error', message: describeError(error) });
      return false;
    }
    activeRemote = request.remote;
    activeSession = session;
    try {
      const agent = await session.request('agent.status', {});
      const cursor = loadReconcileCursor(request.remote);
      const sync = await session.request('reconcile.sync', { lastSeq: cursor });

      const historyByJob: Record<string, RunView[]> = {};
      for (const run of sync.runs) {
        historyByJob[run.jobId] = mergeRuns(historyByJob[run.jobId] ?? [], [run]);
      }
      const lastSeq = Math.max(cursor, sync.lastSeq);
      saveReconcileCursor(request.remote, lastSeq);

      const warning = session.handshake.warning;
      unsubscribe = session.onEvent(frame => handleEventFrame(set, frame));
      set({
        status: warning === undefined ? 'ready' : 'warning',
        message: warning?.detail ?? null,
        agent: {
          agentVersion: agent.agentVersion,
          unitState: agent.unitState,
          linger: agent.linger,
          lingerByTako: agent.lingerByTako,
        },
        jobs: sync.jobs,
        historyByJob,
        lastSeq,
      });
      return true;
    } catch (error) {
      // Connected but could not bootstrap: the session is useless — drop it.
      await session.close().catch(() => {});
      activeSession = null;
      set({ status: 'error', message: describeError(error) });
      return false;
    }
  },

  disconnect: async () => {
    unsubscribe?.();
    unsubscribe = null;
    const session = activeSession;
    activeSession = null;
    if (session !== null) await session.close().catch(() => {});
    set({ ...initialTasksState });
  },

  refresh: async () => {
    if (activeSession === null) return false;
    try {
      const { jobs } = await activeSession.request('jobs.list', {});
      set({ jobs });
      return true;
    } catch (error) {
      await failSession(set, error);
      return false;
    }
  },

  select: jobId => {
    set({ selectedJobId: jobId });
    // Lazy history: fetch once for a job with no cached history (fire and
    // forget — the store settles when the response lands).
    if (jobId !== null && get().historyByJob[jobId] === undefined) {
      void get().loadHistory(jobId);
    }
  },

  upsert: async job => {
    if (activeSession === null) return null;
    try {
      const result = await activeSession.request('jobs.upsert', job);
      set(state => {
        const others = state.jobs.filter(view => view.job.id !== job.id);
        return { jobs: [...others, result.job] };
      });
      return result.job;
    } catch (error) {
      await failSession(set, error);
      return null;
    }
  },

  remove: async jobId => {
    if (activeSession === null) return false;
    try {
      const { deleted } = await activeSession.request('jobs.delete', { jobId });
      if (deleted) {
        set(state => ({ jobs: state.jobs.filter(view => view.job.id !== jobId) }));
      }
      return deleted;
    } catch (error) {
      await failSession(set, error);
      return false;
    }
  },

  trigger: async (jobId, mode) => {
    if (activeSession === null) return null;
    try {
      const { run } = await activeSession.request('jobs.trigger', { jobId, mode });
      // Next state is computed from a get() snapshot so the cursor side
      // effect (conf write) stays OUT of the set() updater — updaters must
      // stay pure (9.7: they can run more than once).
      const state = get();
      const historyByJob = {
        ...state.historyByJob,
        [jobId]: mergeRuns(state.historyByJob[jobId] ?? [], [run]),
      };
      const lastSeq = Math.max(state.lastSeq, run.seq);
      if (activeRemote !== null) saveReconcileCursor(activeRemote, lastSeq);
      set({ historyByJob, lastSeq });
      return run;
    } catch (error) {
      await failSession(set, error);
      return null;
    }
  },

  loadHistory: async jobId => {
    if (activeSession === null) return [];
    try {
      const response = await activeSession.request('jobs.history', { jobId });
      const state = get();
      const merged = mergeRuns(state.historyByJob[jobId] ?? [], response.runs);
      const lastSeq = Math.max(state.lastSeq, response.lastSeq);
      if (activeRemote !== null) saveReconcileCursor(activeRemote, lastSeq);
      set({ historyByJob: { ...state.historyByJob, [jobId]: merged }, lastSeq });
      return merged;
    } catch (error) {
      await failSession(set, error);
      return [];
    }
  },
}));

// ---------------------------------------------------------------------------
// Push events + failure plumbing
// ---------------------------------------------------------------------------

/** The slice of zustand's setter these helpers use (state or updater form). */
type TasksSet = (partial: Partial<TasksState> | ((state: TasksState) => Partial<TasksState>)) => void;

function handleEventFrame(set: TasksSet, frame: AgentFrame): void {
  if (frame.kind !== 'event') return;
  switch (frame.type) {
    case 'job.state_changed':
      set(state => ({
        historyByJob: applyJobStateChanged(state.historyByJob, frame.payload as JobStateChangedPayload),
      }));
      return;
    case 'run.completed':
      set(state => ({ historyByJob: applyRunCompleted(state.historyByJob, frame.payload as RunCompletedPayload) }));
      return;
    case 'protocol.warning':
      set({ status: 'warning', message: (frame.payload as { detail?: string }).detail ?? 'protocol warning' });
      return;
  }
}

async function failSession(set: TasksSet, error: unknown): Promise<void> {
  const session = activeSession;
  activeSession = null;
  unsubscribe?.();
  unsubscribe = null;
  if (session !== null) await session.close().catch(() => {});
  set({ status: 'error', message: describeError(error) });
}

/** Test seam: synchronously reset the singleton store (public via the slice index). */
export function resetTasksStoreForTests(): void {
  useTasksStore.getState().reset();
}
