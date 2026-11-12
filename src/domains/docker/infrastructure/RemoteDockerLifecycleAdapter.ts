// RemoteDockerLifecycleAdapter.ts — ContainerLifecycleRunner port over
// RemoteCommandRunner (iteration 3 of tui-remote-home-screen)
//
// Implements the RunContainerLifecycle port on top of the remotes domain's
// RemoteCommandRunner port (injected; this adapter never opens SSH itself),
// identical discipline to RemoteDockerPsAdapter. The command is built ONLY
// from a closed-union op and a docker-safe name — the adapter re-checks the
// name defensively (the use case already gated it): an unsafe name returns a
// failed CommandExecution and the runner is never called, so no shell string
// is ever built from unvalidated input (threat matrix: no shell construction
// from untrusted data). The remotes port is a type-only import: runtime
// wiring lives at the composition root (services layer).

import type { RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import type { ContainerLifecycleRequest, ContainerLifecycleRunner } from '../application/RunContainerLifecycle.js';
import { isValidContainerName } from '../domain/container-lifecycle.js';
import type { CommandExecution } from '../domain/types.js';

/** The exact remote command for one lifecycle op: `docker start <name>`,
 * `docker restart <name>`, or `docker stop <name>`. Callers must have
 * passed the name gate. */
export function dockerLifecycleCommand(op: ContainerLifecycleRequest['op'], container: string): string {
  return `docker ${op} ${container}`;
}

/** Use case port implemented here — see application/RunContainerLifecycle.ts. */
export class RemoteDockerLifecycleAdapter implements ContainerLifecycleRunner {
  private readonly runner: RemoteCommandRunner;

  constructor(runner: RemoteCommandRunner) {
    this.runner = runner;
  }

  async run(request: ContainerLifecycleRequest): Promise<CommandExecution> {
    // Defensive re-check: the use case refuses before calling, but this
    // adapter owns the command string — it never builds one from a name
    // that could carry shell metacharacters.
    if (!isValidContainerName(request.container)) {
      return { exitCode: 1, stdout: '', stderr: `invalid container name "${request.container}"` };
    }

    const result = await this.runner.run(dockerLifecycleCommand(request.op, request.container));

    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
  }
}
