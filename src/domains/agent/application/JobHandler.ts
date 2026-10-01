// JobHandler.ts — PORT interface (application layer owns this, task 3.9)
//
// Server-side execution port: maps a job definition to its concrete work.
// Implementations live OUTSIDE the agent domain — the agent-mode composition
// root (`src/cli/commands/agent-run.ts`, WU6/7) wires job types to docker
// use cases (design D4: the agent domain never imports docker).
import type { JobDefinition, RunMode, TerminalRunStatus } from '../domain/types.js';

/** Result of executing one job; `result` carries the dry-run report / outcome. */
export interface JobExecutionOutcome {
  readonly status: TerminalRunStatus;
  /** JSON-able outcome (e.g. prune report). Undefined means "no report". */
  readonly result?: unknown;
}

/** Port: execute one job definition in the given mode (dry-run mutates nothing). */
export interface JobHandler {
  execute(job: JobDefinition, mode: RunMode): Promise<JobExecutionOutcome>;
}

/** Convenience for the server-config stub: every run ends unsupported (v0). */
export const UNSUPPORTED_OUTCOME: JobExecutionOutcome = { status: 'unsupported' };
