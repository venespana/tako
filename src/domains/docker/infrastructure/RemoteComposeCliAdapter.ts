// RemoteComposeCliAdapter.ts — ComposeStatusReader port over RemoteCommandRunner (S3)
//
// Implements the GetStackStatus port on top of the remotes domain's
// RemoteCommandRunner port (injected; this adapter never opens SSH itself).
// The command is ONE fixed string — no user input ever reaches it, so there
// is nothing to quote or escape (threat matrix: no shell construction from
// untrusted data). The remotes port is a type-only import: runtime wiring
// lives at the composition root (services layer, S4), mirroring the D4
// agent→remotes discipline.

import type { RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import type { ComposeStatusReader } from '../application/GetStackStatus.js';
import type { CommandExecution } from '../domain/types.js';

/** The one remote command this adapter ever runs (read-only compose listing). */
export const COMPOSE_LS_COMMAND = 'docker compose ls --format json';

/** Use case port implemented here — see application/GetStackStatus.ts. */
export class RemoteComposeCliAdapter implements ComposeStatusReader {
  private readonly runner: RemoteCommandRunner;

  constructor(runner: RemoteCommandRunner) {
    this.runner = runner;
  }

  async read(): Promise<CommandExecution> {
    const result = await this.runner.run(COMPOSE_LS_COMMAND);

    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
  }
}
