// GetStackStatus.ts — use case: compose stack status via a port (S2 of mvp-status-command)
//
// Runs `docker compose ls --format json` through the ComposeStatusReader
// port and parses the answer with the strict domain parser. Remote failures
// are DATA: a non-zero (or signal-killed) exit and malformed output map to
// refusal objects — an expected outcome never throws.
//
// The port is declared here (application owns its ports);
// infrastructure/RemoteComposeCliAdapter.ts (S3) is its sole production
// consumer.

import { parseComposeLsJson } from '../domain/stack-status.js';
import type { StackStatusEntry } from '../domain/stack-status.js';
import type { CommandExecution } from '../domain/types.js';

/** Port: run `docker compose ls --format json` on the target host. */
export interface ComposeStatusReader {
  read(): Promise<CommandExecution>;
}

/** Outcome: the host's stack list, or a refusal naming why it is absent. */
export type GetStackStatusResult =
  | { readonly kind: 'ok'; readonly entries: readonly StackStatusEntry[] }
  | { readonly kind: 'refusal'; readonly reason: string };

/** Use case: read the compose stack status of one host. */
export class GetStackStatus {
  private readonly reader: ComposeStatusReader;

  constructor(reader: ComposeStatusReader) {
    this.reader = reader;
  }

  /** Non-zero and signal-killed exits are refusals; remote stderr wins as the reason. */
  private refusalFrom(execution: CommandExecution): GetStackStatusResult {
    const stderr = execution.stderr.trim();

    if (stderr !== '') return { kind: 'refusal', reason: stderr };

    return {
      kind: 'refusal',
      reason:
        execution.exitCode === null
          ? 'docker compose ls was terminated by a signal'
          : `docker compose ls exited with code ${execution.exitCode}`,
    };
  }

  async execute(): Promise<GetStackStatusResult> {
    const execution = await this.reader.read();

    if (execution.exitCode !== 0) return this.refusalFrom(execution);

    return parseComposeLsJson(execution.stdout);
  }
}
