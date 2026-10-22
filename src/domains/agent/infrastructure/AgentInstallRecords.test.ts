// infrastructure/AgentInstallRecords.test.ts — STRICT TDD RED phase (task 6.8)
//
// Exec-backed install records under the remote ~/.tako directory. WU6
// decision: the "recorded prior install" facts the client-side provisioning
// flow must read/write (prior-install sha256 for the decoy guard, the
// linger-by-tako marker per D8) live in PLAIN FILES, not agent_meta — the
// install flow runs client-side and cannot synchronously write the remote
// SQLite store (the LingerMetaStore seam is sync; exec is async). agent_meta
// keeps the server-side facts the agent itself owns (installed_version/
// installed_at, recorded at agent start).
import { describe, expect, it } from 'vitest';

import {
  AGENT_DIR_NAME,
  INSTALLED_SHA256_FILENAME,
  LINGER_BY_TAKO_FILENAME,
  RemoteInstallRecords,
} from './AgentInstallRecords.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';

const OK = (stdout = ''): RemoteCommandResult => ({ stdout, stderr: '', exitCode: 0 });
const FAIL = (stderr = 'nope', exitCode = 1): RemoteCommandResult => ({ stdout: '', stderr, exitCode });

class ScriptedRunner implements RemoteCommandRunner {
  readonly calls: string[] = [];

  constructor(private readonly respond: (command: string) => RemoteCommandResult) {}

  async run(command: string): Promise<RemoteCommandResult> {
    this.calls.push(command);
    return this.respond(command);
  }
}

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function homeRunner(extra: (command: string) => RemoteCommandResult | undefined = () => undefined) {
  return new ScriptedRunner(command => {
    if (command === 'printf %s "$HOME"') return OK('/home/ops');

    return extra(command) ?? (command.includes(INSTALLED_SHA256_FILENAME) ? FAIL('No such file or directory') : OK());
  });
}

describe('RemoteInstallRecords', () => {
  it('6.8 RED: resolves the remote home once via exec and caches it', async () => {
    const runner = homeRunner();
    const records = new RemoteInstallRecords(runner);

    await records.readInstalledSha256();
    await records.writeLingerByTako();

    const homeCalls = runner.calls.filter(call => call === 'printf %s "$HOME"');
    expect(homeCalls).toHaveLength(1);
  });

  it('6.8 RED: reads the recorded prior-install sha256 (64-hex) or undefined when absent', async () => {
    const runner = homeRunner(command =>
      command.includes(INSTALLED_SHA256_FILENAME) ? OK(`${SHA_A}  /home/ops/.tako/installed.sha256`) : FAIL('missing')
    );
    const records = new RemoteInstallRecords(runner);

    expect(await records.readInstalledSha256()).toBe(SHA_A);

    const missingRunner = homeRunner(command =>
      command.includes(INSTALLED_SHA256_FILENAME) ? FAIL('No such file or directory') : OK()
    );
    expect(await new RemoteInstallRecords(missingRunner).readInstalledSha256()).toBeUndefined();
  });

  it('6.8 RED: rejects a corrupted prior-install sha256 record instead of trusting it', async () => {
    const runner = homeRunner(command =>
      command.includes(INSTALLED_SHA256_FILENAME) ? OK('not-a-sha garbage') : OK()
    );

    await expect(new RemoteInstallRecords(runner).readInstalledSha256()).rejects.toThrow(/installed\.sha256/);
  });

  it('6.8 RED: writes the installed sha256 and the linger-by-tako marker under ~/.tako', async () => {
    const runner = homeRunner(command => (command.startsWith('printf') ? OK() : undefined));
    const records = new RemoteInstallRecords(runner);

    await records.writeInstalledSha256(SHA_B);
    await records.writeLingerByTako();

    expect(runner.calls).toContainEqual(
      `printf '%s' '${SHA_B}' > '/home/ops/${AGENT_DIR_NAME}/${INSTALLED_SHA256_FILENAME}'`
    );
    expect(runner.calls).toContainEqual(`printf '1' > '/home/ops/${AGENT_DIR_NAME}/${LINGER_BY_TAKO_FILENAME}'`);
  });

  it('6.8 RED: record writes are exit-checked — a failing write throws', async () => {
    const runner = new ScriptedRunner(command => {
      if (command === 'printf %s "$HOME"') return OK('/home/ops');

      if (command.includes(INSTALLED_SHA256_FILENAME)) return FAIL('read-only file system');

      return OK();
    });

    await expect(new RemoteInstallRecords(runner).writeInstalledSha256(SHA_B)).rejects.toThrow(/read-only file system/);
  });
});
