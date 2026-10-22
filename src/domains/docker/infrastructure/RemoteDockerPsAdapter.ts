// RemoteDockerPsAdapter.ts — DockerContainersReader port over
// RemoteCommandRunner (iteration 2 of tui-remote-home-screen)
//
// Implements the GetContainers port on top of the remotes domain's
// RemoteCommandRunner port (injected; this adapter never opens SSH itself),
// identical discipline to RemoteComposeCliAdapter. The command is ONE fixed
// string — no user input ever reaches it, so there is nothing to quote or
// escape (threat matrix: no shell construction from untrusted data). The
// remotes port is a type-only import: runtime wiring lives at the
// composition root (services layer).

import type { RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import type { DockerContainersReader } from '../application/GetContainers.js';
import type { CommandExecution } from '../domain/types.js';

/** The one remote command this adapter ever runs (read-only container listing). */
export const DOCKER_PS_COMMAND = "docker ps -a --format '{{json .}}'";

/** Use case port implemented here — see application/GetContainers.ts. */
export class RemoteDockerPsAdapter implements DockerContainersReader {
  private readonly runner: RemoteCommandRunner;

  constructor(runner: RemoteCommandRunner) {
    this.runner = runner;
  }

  async read(): Promise<CommandExecution> {
    const result = await this.runner.run(DOCKER_PS_COMMAND);

    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
  }
}
