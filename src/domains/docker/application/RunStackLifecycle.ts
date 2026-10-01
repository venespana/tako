// RunStackLifecycle.ts — use case: compose stack lifecycle via a port (task 5.3)
//
// Validates untrusted op/stackDir/mode IN-DOMAIN before anything is
// assembled (threat matrix: remote shell construction), assembles the exact
// compose argv, and applies the dry-run-first discipline: dry-run returns
// the command that WOULD run and never touches the port.
//
// The ComposeRunner port is declared here (application owns its ports);
// infrastructure/ComposeCliAdapter.ts is its sole production consumer.

import { assertValidStackDir } from '../domain/stack-dir.js';
import { EXECUTION_MODES, LIFECYCLE_OPS } from '../domain/types.js';
import type {
  CommandExecution,
  ComposeCommand,
  ExecutionMode,
  LifecycleOp,
  StackLifecycleReport,
} from '../domain/types.js';

/** Validated inputs for one lifecycle invocation. `unknown` is deliberate:
 * values arrive from persisted JSON / protocol payloads, so the trust
 * boundary is HERE, not at the composition root. */
export interface RunStackLifecycleInput {
  readonly op: unknown;
  readonly stackDir: unknown;
  readonly mode: unknown;
}

/** Port: execute one prepared compose command (argv, never shell). */
export interface ComposeRunner {
  run(command: ComposeCommand): Promise<CommandExecution>;
}

/** Input validation failure naming the rejected field (`op` or `mode`). */
export class StackLifecycleValidationError extends Error {
  /** Which input field was rejected. */
  readonly field: 'op' | 'mode';
  /** Why it was rejected. */
  readonly reason: string;

  constructor(field: 'op' | 'mode', reason: string) {
    super(`invalid stack lifecycle ${field}: ${reason}`);
    this.name = 'StackLifecycleValidationError';
    this.field = field;
    this.reason = reason;
  }
}

/**
 * Exact compose argv for one lifecycle op. `up` runs detached (`-d`):
 * scheduled unattended runs must never attach to a tty or they would hang
 * the agent forever. down/pull/restart are the bare compose verbs.
 */
export function composeLifecycleArgv(op: LifecycleOp): string[] {
  switch (op) {
    case 'up':
      return ['docker', 'compose', 'up', '-d'];
    case 'down':
      return ['docker', 'compose', 'down'];
    case 'pull':
      return ['docker', 'compose', 'pull'];
    case 'restart':
      return ['docker', 'compose', 'restart'];
  }
}

function assertLifecycleOp(value: unknown): LifecycleOp {
  if (typeof value !== 'string' || !(LIFECYCLE_OPS as readonly string[]).includes(value)) {
    throw new StackLifecycleValidationError('op', `must be one of ${LIFECYCLE_OPS.join('|')}`);
  }
  return value as LifecycleOp;
}

function assertExecutionMode(value: unknown): ExecutionMode {
  if (typeof value !== 'string' || !(EXECUTION_MODES as readonly string[]).includes(value)) {
    throw new StackLifecycleValidationError('mode', `must be one of ${EXECUTION_MODES.join('|')}`);
  }
  return value as ExecutionMode;
}

/** Use case: run (or plan) one compose lifecycle operation on a stack. */
export class RunStackLifecycle {
  private readonly compose: ComposeRunner;

  constructor(compose: ComposeRunner) {
    this.compose = compose;
  }

  /**
   * Dry-run: return the exact would-run command, mutate nothing.
   * Apply: execute via the port; non-zero (or signal-killed) exits are a
   * `failed` report — the exit status is data, not an exception.
   *
   * @throws StackDirValidationError for hostile stack directories.
   * @throws StackLifecycleValidationError for op/mode outside their unions.
   */
  async execute(input: RunStackLifecycleInput): Promise<StackLifecycleReport> {
    const op = assertLifecycleOp(input.op);
    const mode = assertExecutionMode(input.mode);
    const stackDir = assertValidStackDir(input.stackDir);
    const command: ComposeCommand = { argv: composeLifecycleArgv(op), cwd: stackDir };

    if (mode === 'dry-run') {
      return { mode, op, stackDir, command, status: 'planned' };
    }

    const execution = await this.compose.run(command);
    const status = execution.exitCode === 0 ? 'succeeded' : 'failed';
    return { mode, op, stackDir, command, execution, status };
  }
}
