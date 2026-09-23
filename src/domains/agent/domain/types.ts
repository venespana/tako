// domain/types.ts — agent domain core types (task 3.1)
//
// Pure module: no I/O, no node imports. These types are shared by the agent
// protocol (client + server), the JobStore port, and the TUI job views.

/**
 * Shell-safe identifier: lowercase alphanumeric with inner dashes, 1-64 chars.
 * Doubles as the idempotent job identity (spec `agent-jobs#Idempotent-Job-Identity`).
 */
export type Slug = string;

/** Character set enforcing shell safety for {@link Slug} values. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Compose stack lifecycle operation (spec `agent-jobs#Stack-Lifecycle-Jobs`). */
export type StackLifecycleOp = 'up' | 'down' | 'pull' | 'restart';

/**
 * Safe prune scopes — a CLOSED union per ADR-0008: volume prune and
 * all-images prune (`image prune -af`) are unrepresentable, and the
 * rejection is structural, not UI-dependent (spec `agent-jobs#Safe-Prune-Jobs`).
 */
export type PruneScopes = 'stopped-containers' | 'dangling-images' | 'build-cache';

/**
 * Runtime list of {@link PruneScopes} members, in canonical order.
 *
 * PARITY WITNESS (9.7): this list must stay member-wise identical to
 * `docker/domain`'s `PruneScope`/`PRUNE_SCOPES` (the agent mirrors the
 * docker domain's closed union; ADR-0015 forbids importing it directly).
 * The co-located parity test pins both directions — a member added to
 * either side without the other fails typecheck and the runtime equality.
 */
export const PRUNE_SCOPES: readonly PruneScopes[] = ['stopped-containers', 'dangling-images', 'build-cache'];

/** v0 schedules are cron-only; one-shot scheduling is deferred (design §Job & Run Model). */
export interface Schedule {
  readonly kind: 'cron';
  readonly expr: string;
}

/** Closed v0 job taxonomy (design §Job & Run Model). */
export type JobDefinition =
  | {
      readonly id: Slug;
      readonly type: 'stack-lifecycle';
      readonly op: StackLifecycleOp;
      readonly stackDir: string;
      readonly schedule: Schedule;
    }
  | {
      readonly id: Slug;
      readonly type: 'prune';
      readonly scopes: PruneScopes[];
      readonly schedule: Schedule;
    }
  | {
      readonly id: Slug;
      readonly type: 'server-config';
      readonly schedule: Schedule;
    };

/** Run execution mode: dry-run produces a report and mutates nothing. */
export type RunMode = 'dry-run' | 'apply';

/** Run lifecycle states; `succeeded | failed | unsupported` are terminal (design §Job & Run Model). */
export type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'unsupported';

/** Terminal run statuses. */
export type TerminalRunStatus = Extract<RunStatus, 'succeeded' | 'failed' | 'unsupported'>;

/** Job projection served over the protocol (jobs.list / jobs.upsert / reconcile.sync). */
export interface JobView {
  readonly job: JobDefinition;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Run projection served over the protocol (jobs.history / reconcile.sync / push events). */
export interface RunView {
  /** Monotonic reconcile cursor (AUTOINCREMENT in the runs table). */
  readonly seq: number;
  readonly id: string;
  readonly jobId: Slug;
  readonly mode: RunMode;
  readonly status: RunStatus;
  /** True when this run is the missed-once catch-up execution. */
  readonly catchup: boolean;
  readonly startedAt: string;
  readonly finishedAt?: string;
  /** Outcome / dry-run report (JSON-able); owned by the job handler. */
  readonly result?: unknown;
}

/** Agent lifecycle as seen from the client (design §Job & Run Model); drives TUI badges. */
export type AgentLifecycle =
  'not_installed' | 'installing' | 'active' | 'inactive_unit' | 'unreachable' | 'version_mismatch';
