// domain/types.ts — docker domain core types (task 5.1)
//
// Pure module: no I/O, no node imports, no dockerode. `PruneScope` is a
// CLOSED union per ADR-0008: volume prune and all-images prune
// (`image prune -af`) are structurally unrepresentable — rejection does not
// depend on the UI or on call-site discipline (spec `agent-jobs#Safe-Prune-Jobs`).

/** Safe prune scopes — closed union per ADR-0008 (cleanup policy). */
export type PruneScope = 'stopped-containers' | 'dangling-images' | 'build-cache';

/** Closed members of {@link PruneScope}, in canonical order. */
export const PRUNE_SCOPES: readonly PruneScope[] = ['stopped-containers', 'dangling-images', 'build-cache'];

/** Compose stack lifecycle operation (spec `agent-jobs#Stack-Lifecycle-Jobs`). */
export type LifecycleOp = 'up' | 'down' | 'pull' | 'restart';

/** Closed members of {@link LifecycleOp}. */
export const LIFECYCLE_OPS: readonly LifecycleOp[] = ['up', 'down', 'pull', 'restart'];

/** Run execution mode: dry-run produces a report and mutates nothing. */
export type ExecutionMode = 'dry-run' | 'apply';

/** Closed members of {@link ExecutionMode}. */
export const EXECUTION_MODES: readonly ExecutionMode[] = ['dry-run', 'apply'];

/** Docker filter map, the shape dockerode accepts as its `filters` argument. */
export type DockerFilters = Record<string, string[]>;

/** A command prepared for argv (never shell) execution. */
export interface ComposeCommand {
  /** Full argv, starting with the docker binary itself. */
  readonly argv: readonly string[];
  /** Working directory the command runs in (the compose stack directory). */
  readonly cwd: string;
}

/** Captured result of one executed command. */
export interface CommandExecution {
  /** Exit status; null when the command was terminated by a signal. */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Outcome status of a lifecycle/prune report. */
export type ReportStatus = 'planned' | 'succeeded' | 'failed';

/**
 * Report of one stack lifecycle invocation. Dry-run fills `command` with the
 * exact argv that WOULD run and leaves `execution` undefined; apply fills
 * both (spec `agent-jobs#Dry-Run-First-Destructive-Jobs` analog for lifecycle).
 */
export interface StackLifecycleReport {
  readonly mode: ExecutionMode;
  readonly op: LifecycleOp;
  readonly stackDir: string;
  readonly command: ComposeCommand;
  /** Captured stdout/stderr/exit — present only when the command actually ran. */
  readonly execution?: CommandExecution;
  readonly status: ReportStatus;
}

/** One item a prune would remove (dry-run) or removed (apply). */
export interface PruneItem {
  /** Docker object ID (or build-cache ID). */
  readonly id: string;
  /** Human-oriented hint: container name + image, image tags, cache type… */
  readonly description?: string;
}

/** Per-scope prune outcome, shared by the dry-run plan and the apply result. */
export interface PruneScopeReport {
  readonly scope: PruneScope;
  /** Would-remove list on dry-run; actually-removed list (best effort) on apply. */
  readonly items: readonly PruneItem[];
  /** Items listed, or the count reported by docker when IDs are not returned. */
  readonly count: number;
  /** Bytes reclaimed as reported by docker (apply); estimated where available. */
  readonly spaceReclaimedBytes?: number;
  /**
   * Set when THIS scope failed while others succeeded: the run is only
   * partially applied, and the already-executed scopes keep their reports
   * visible instead of being discarded (unattended destructive jobs).
   */
  readonly error?: string;
}

/** Shared prune report shape: dry-run plan and apply result (task 5.4). */
export interface PruneReport {
  readonly mode: ExecutionMode;
  readonly scopes: readonly PruneScope[];
  readonly entries: readonly PruneScopeReport[];
}
