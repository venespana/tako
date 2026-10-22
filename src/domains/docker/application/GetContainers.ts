// GetContainers.ts — use case: container listing via a port (iteration 2 of
// tui-remote-home-screen)
//
// Runs `docker ps -a --format '{{json .}}'` through the DockerContainersReader
// port and parses the answer with the strict domain parser. Remote failures
// are DATA: a non-zero (or signal-killed) exit and malformed output map to
// refusal objects — an expected outcome never throws.
//
// The port is declared here (application owns its ports);
// infrastructure/RemoteDockerPsAdapter.ts is its sole production consumer,
// mirroring the GetStackStatus layering.

import { parseDockerPsJson } from '../domain/container-status.js';
import type { ContainerSnapshot } from '../domain/container-status.js';
import type { CommandExecution } from '../domain/types.js';

/** Port: run `docker ps -a --format '{{json .}}'` on the target host. */
export interface DockerContainersReader {
  read(): Promise<CommandExecution>;
}

/** Outcome: the host's container list, or a refusal naming why it is absent. */
export type GetContainersResult =
  | { readonly kind: 'ok'; readonly containers: readonly ContainerSnapshot[] }
  | { readonly kind: 'refusal'; readonly reason: string };

/** Use case: read the docker container list of one host. */
export class GetContainers {
  private readonly reader: DockerContainersReader;

  constructor(reader: DockerContainersReader) {
    this.reader = reader;
  }

  /** Non-zero and signal-killed exits are refusals; remote stderr wins as the reason. */
  private refusalFrom(execution: CommandExecution): GetContainersResult {
    const stderr = execution.stderr.trim();

    if (stderr !== '') return { kind: 'refusal', reason: stderr };

    return {
      kind: 'refusal',
      reason:
        execution.exitCode === null
          ? 'docker ps was terminated by a signal'
          : `docker ps exited with code ${execution.exitCode}`,
    };
  }

  async execute(): Promise<GetContainersResult> {
    const execution = await this.reader.read();

    if (execution.exitCode !== 0) return this.refusalFrom(execution);

    return parseDockerPsJson(execution.stdout);
  }
}
