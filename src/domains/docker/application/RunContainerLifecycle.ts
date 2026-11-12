// RunContainerLifecycle.ts — use case: one container lifecycle op (start,
// restart, stop) via a port (iteration 3 of tui-remote-home-screen; stop by
// T2-container-stop)
//
// Validates op and container name IN-DOMAIN BEFORE the port is touched: a
// rejected input is a refusal object and the runner is never called, so no
// unvalidated byte ever reaches a command string. Remote failures are DATA:
// a non-zero (or signal-killed) exit maps to a refusal carrying the remote
// stderr — an expected outcome never throws (GetContainers.refusalFrom
// discipline).
//
// The port is declared here (application owns its ports);
// infrastructure/RemoteDockerLifecycleAdapter.ts is its sole production
// consumer, mirroring the GetContainers layering.

import { isContainerLifecycleOp, isValidContainerName } from '../domain/container-lifecycle.js';
import type { ContainerLifecycleOp } from '../domain/container-lifecycle.js';
import type { CommandExecution } from '../domain/types.js';

/** One lifecycle request: the closed-union op and the target container. */
export interface ContainerLifecycleRequest {
  readonly op: ContainerLifecycleOp;
  readonly container: string;
}

/** Port: run one container lifecycle command on the target host. */
export interface ContainerLifecycleRunner {
  run(request: ContainerLifecycleRequest): Promise<CommandExecution>;
}

/** Outcome: the command ran, or a refusal naming why it did not. */
export type RunContainerLifecycleResult =
  { readonly kind: 'ok' } | { readonly kind: 'refusal'; readonly reason: string };

/** Use case: run one lifecycle op (start, restart, or stop) on a docker container. */
export class RunContainerLifecycle {
  private readonly runner: ContainerLifecycleRunner;

  constructor(runner: ContainerLifecycleRunner) {
    this.runner = runner;
  }

  /** Non-zero and signal-killed exits are refusals; remote stderr wins as the reason. */
  private refusalFrom(execution: CommandExecution, op: ContainerLifecycleOp): RunContainerLifecycleResult {
    const stderr = execution.stderr.trim();

    if (stderr !== '') return { kind: 'refusal', reason: stderr };

    return {
      kind: 'refusal',
      reason:
        execution.exitCode === null
          ? `docker ${op} was terminated by a signal`
          : `docker ${op} exited with code ${execution.exitCode}`,
    };
  }

  async execute(request: ContainerLifecycleRequest): Promise<RunContainerLifecycleResult> {
    // The gate runs BEFORE the port: an out-of-union op or an unsafe name is
    // refused without touching the runner.
    if (!isContainerLifecycleOp(request.op)) {
      return { kind: 'refusal', reason: `unknown container lifecycle op "${String(request.op)}"` };
    }

    if (!isValidContainerName(request.container)) {
      return { kind: 'refusal', reason: `invalid container name "${request.container}"` };
    }

    const execution = await this.runner.run({ op: request.op, container: request.container });

    if (execution.exitCode !== 0) return this.refusalFrom(execution, request.op);

    return { kind: 'ok' };
  }
}
