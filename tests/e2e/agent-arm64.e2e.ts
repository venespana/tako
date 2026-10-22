// e2e/agent-arm64.e2e.ts — arm64 end-to-end (task 8.15 — GATED).
//
// THE SCENARIO (design §Testing Strategy, spec agent-jobs#Disconnected-
// execution + #Reconcile-on-connect): the compiled linux-arm64 binary is
// installed as the agent on a NATIVE arm64 systemd container (arm64 cannot
// run under an x64 docker daemon — this suite requires a native arm64
// runner, hence the TAKO_E2E_ARM64=1 gate). Flow:
//
//   1. `tako agent install <remote>` over real SSH (arm64 copy path)
//   2. schedule an hourly prune job via jobs.upsert over the transport
//   3. close the client session entirely
//   4. wait past the next cron firing — the AGENT executes the job alone
//   5. reconnect → reconcile.sync delivers the run executed while away
//
// GATED: skips (never fails) unless TAKO_E2E_ARM64=1 AND the compiled
// arm64 binary is provided via TAKO_E2E_BINARY (path) — a native arm64
// runner with a systemd-capable docker daemon is required.
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, describe, expect, it } from 'vitest';

import { runAgentInstall, type AgentInstallDeps } from '../../src/domains/agent/infrastructure/AgentInstallPipeline.js';
import { StreamLocalAgentTransport } from '../../src/domains/agent/infrastructure/StreamLocalAgentTransport.js';
import { SshConnectionManager } from '../../src/domains/remotes/infrastructure/SshConnectionManager.js';
import { SshRemoteCommandRunner } from '../../src/domains/remotes/infrastructure/SshRemoteCommandRunner.js';
import { StreamLocalAgentChannel } from '../../src/domains/remotes/infrastructure/StreamLocalAgentChannel.js';

const GATED = process.env['TAKO_E2E_ARM64'] === '1';
const BINARY = process.env['TAKO_E2E_BINARY'] ?? '';
const SSH_USER = 'tako';
const SSH_PASSWORD = 'arm64-e2e-pass';
const PRUNE_CRON = '* * * * *'; // every minute — the suite waits ≤90s for one firing

const describeGated = GATED && BINARY !== '' ? describe : describe.skip;

interface RemoteEndpoint {
  readonly host: string;
  readonly port: number;
}

function installDeps(endpoint: RemoteEndpoint, log: (line: string) => void): AgentInstallDeps {
  return {
    remoteName: 'arm64-e2e',
    config: {
      host: endpoint.host,
      port: endpoint.port,
      username: SSH_USER,
      auth: { type: 'password', password: SSH_PASSWORD },
    },
    clientVersion: '0.0.0-e2e',
    localBinaryPath: BINARY,
    log,
    error: line => log(`! ${line}`),
  };
}

async function openAgentSession(endpoint: RemoteEndpoint) {
  const manager = new SshConnectionManager({
    host: endpoint.host,
    port: endpoint.port,
    username: SSH_USER,
    auth: { type: 'password', password: SSH_PASSWORD },
  });
  const runner = new SshRemoteCommandRunner(manager);
  const transport = new StreamLocalAgentTransport({
    channel: new StreamLocalAgentChannel(manager, runner),
    clientVersion: '0.0.0-e2e',
  });
  return transport.connect();
}

describeGated('agent arm64 e2e — install, schedule, disconnect, fire, reconcile (8.15)', () => {
  let container: StartedTestContainer;
  let endpoint: RemoteEndpoint;
  const logs: string[] = [];
  const log = (line: string): void => {
    logs.push(line);
  };

  afterAll(async () => {
    await container?.stop();
  });

  it('boots a native arm64 systemd container', async () => {
    expect(statSync(BINARY).isFile()).toBe(true);
    container = await new GenericContainer('jrei/systemd-ubuntu:latest')
      .withPrivilegedMode()
      .withExposedPorts(22)
      .start();
    const arch = (await container.exec(['uname', '-m'])).output.trim();
    expect(arch).toBe('aarch64'); // native arm64 runner — the whole point of the gate
    endpoint = { host: '127.0.0.1', port: container.getMappedPort(22) };
  });

  it('installs the agent from the arm64 binary (copy path, probe passes)', async () => {
    const exit = await runAgentInstall(installDeps(endpoint, log));
    expect(exit).toBe(0);
    expect(logs.join('\n')).toContain('survive-disconnect probe passed');
  });

  it('schedules a prune job, disconnects, lets the agent fire alone, and reconciles the run', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'tako-arm64-e2e-'));

    try {
      const first = await openAgentSession(endpoint);
      await first.request('jobs.upsert', {
        id: 'e2e-prune',
        type: 'prune',
        scopes: ['dangling-images'],
        schedule: { kind: 'cron', expr: PRUNE_CRON },
      });
      const before = await first.request('jobs.history', { jobId: 'e2e-prune' });
      await first.close(); // client GONE — the agent must act alone

      // Wait for at least one cron firing (per-minute schedule, ≤90s).
      let fired = before.lastSeq;
      let waited = 0;

      while (waited < 90_000) {
        await new Promise(resolve => setTimeout(resolve, 5_000));
        const probe = await openAgentSession(endpoint);
        const history = await probe.request('jobs.history', { jobId: 'e2e-prune' });
        await probe.close();

        if (history.lastSeq > fired) {
          fired = history.lastSeq;
          break;
        }

        waited += 5_000;
      }

      expect(fired).toBeGreaterThan(before.lastSeq); // the job fired while disconnected

      // Reconnect + reconcile: the run executed while away is delivered.
      const reconnected = await openAgentSession(endpoint);
      const sync = await reconnected.request('reconcile.sync', { lastSeq: before.lastSeq });
      await reconnected.close();
      expect(sync.runs.length).toBeGreaterThan(0);
      expect(sync.runs.every(run => run.jobId === 'e2e-prune')).toBe(true);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 120_000);
});
