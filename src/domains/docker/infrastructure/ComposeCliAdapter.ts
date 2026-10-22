// ComposeCliAdapter.ts — ComposeRunner port over the docker compose CLI (task 5.5)
//
// Sole consumer of node:child_process in the docker domain (ADR-0011 zone
// discipline). Spawns the prepared argv DIRECTLY — no shell — with
// cwd = stackDir, and captures stdout/stderr/exit. Non-zero exits and
// signal kills are results (exitCode carries them); only spawn failures
// (binary missing) reject (threat matrix: commands are never shell strings).

import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

import type { ComposeRunner } from '../application/RunStackLifecycle.js';
import type { CommandExecution, ComposeCommand } from '../domain/types.js';

/** Use case port implemented here — see application/RunStackLifecycle.ts. */
export class ComposeCliAdapter implements ComposeRunner {
  async run(command: ComposeCommand): Promise<CommandExecution> {
    const [bin, ...args] = command.argv;

    if (bin === undefined) {
      throw new Error('compose command has an empty argv');
    }

    return new Promise<CommandExecution>((resolve, reject) => {
      // shell: false is structural honesty — argv is passed to execvp as-is.
      const child = spawn(bin, args, { cwd: command.cwd, shell: false });
      const outDecoder = new StringDecoder('utf8');
      const errDecoder = new StringDecoder('utf8');
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', chunk => {
        stdout += outDecoder.write(chunk as Buffer);
      });
      child.stderr?.on('data', chunk => {
        stderr += errDecoder.write(chunk as Buffer);
      });
      child.on('error', reject);
      child.on('close', (code, signal) => {
        stdout += outDecoder.end();
        stderr += errDecoder.end();
        void signal; // a signal kill is already expressed by code === null
        resolve({ exitCode: code, stdout, stderr });
      });
    });
  }
}
