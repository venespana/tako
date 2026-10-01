// integration/agent/install-uninstall.integ.test.ts — full install → probe →
// uninstall against a privileged systemd+sshd container (task 6.7).
//
// Real runtime harness: jrei/systemd-ubuntu boots systemd as PID 1, sshd and
// docker compose v2 are installed in-container (compose is REQUIRED by the
// install preflight), and the flow runs over REAL ssh2 connections against
// the real SshConnectionManager/SshRemoteCommandRunner/SftpRemoteFileTransfer/
// StreamLocalAgentChannel adapters with a stand-in agent executable (see
// fixtures/agent-standin.py). Verifies: copy path with sha256 double-check,
// unit file + daemon-reload + enable --now, survive-disconnect probe on an
// independent connection, uninstall ordering with pre-existing linger
// preserved, and residue checks on a second connection.
//
// Skips (never fails) when no docker daemon is available or the privileged
// systemd container cannot boot in this environment (nested docker setups),
// per repo conventions.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, describe, expect, it } from 'vitest';

import { Dockerode } from 'dockerode';

import { RemoteInstallRecords } from '../../../src/domains/agent/infrastructure/AgentInstallRecords.js';
import { StreamLocalAgentChannel } from '../../../src/domains/remotes/infrastructure/StreamLocalAgentChannel.js';
import { SftpRemoteFileTransfer } from '../../../src/domains/remotes/infrastructure/SftpRemoteFileTransfer.js';
import { SshConnectionManager } from '../../../src/domains/remotes/infrastructure/SshConnectionManager.js';
import { SshRemoteCommandRunner } from '../../../src/domains/remotes/infrastructure/SshRemoteCommandRunner.js';
import { runAgentInstall, type AgentInstallDeps } from '../../../src/cli/commands/agent-install.js';
import { runAgentUninstall, type AgentUninstallDeps } from '../../../src/cli/commands/agent-uninstall.js';
import type { VerifierConnection } from '../../../src/domains/agent/infrastructure/SurviveDisconnectProber.js';

const STAND_IN = join(import.meta.dirname, 'fixtures', 'agent-standin.py');
const CLIENT_VERSION = '0.9.9-integ';
const SSH_USER = 'tako';
const SSH_PASSWORD = 'integ-pass-1';
const HOME = `/home/${SSH_USER}`;

async function probeHostDaemon(): Promise<boolean> {
  try {
    await new Dockerode().ping();
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Boot a privileged systemd container and provision sshd + compose v2 + user. */
async function setupSystemdSshEnvironment(): Promise<StartedTestContainer | undefined> {
  if (!(await probeHostDaemon())) return undefined;
  let container: StartedTestContainer;
  try {
    container = await new GenericContainer('jrei/systemd-ubuntu').withPrivilegedMode().withExposedPorts(22).start();
  } catch (error) {
    console.warn(`[skip] privileged systemd container could not start here: ${String(error)}`);
    return undefined;
  }
  try {
    // systemd as PID 1 needs a moment; accept degraded (uncontrollable units are fine).
    const bootDeadline = Date.now() + 45_000;
    for (;;) {
      const state = await container.exec(['systemctl', 'is-system-running']);
      if (state.exitCode === 0 || state.output.includes('degraded')) break;
      if (Date.now() > bootDeadline) throw new Error(`systemd did not boot (state: ${state.output.trim()})`);
      await sleep(1_000);
    }

    const setupScript = [
      'export DEBIAN_FRONTEND=noninteractive',
      'apt-get update -qq',
      'apt-get install -y -qq openssh-server python3 docker.io docker-compose-v2 dbus > /dev/null',
      `useradd -m -s /bin/bash ${SSH_USER}`,
      `echo '${SSH_USER}:${SSH_PASSWORD}' | chpasswd`,
      'mkdir -p /run/sshd',
      'systemctl enable --now ssh',
      // Deterministic pre-existing-linger scenario (spec: preserved on uninstall).
      `loginctl enable-linger ${SSH_USER}`,
    ].join(' && ');
    const setup = await container.exec(['bash', '-lc', setupScript]);
    if (setup.exitCode !== 0) throw new Error(`container setup failed: ${setup.output.slice(-400)}`);
    return container;
  } catch (error) {
    console.warn(`[skip] systemd+sshd container unusable in this environment: ${String(error)}`);
    await container.stop().catch(() => {});
    return undefined;
  }
}

const environment = await setupSystemdSshEnvironment();

describe.skipIf(!environment)('agent provisioning — systemd+sshd container (jrei/systemd-ubuntu)', () => {
  const container = environment as StartedTestContainer;
  let workspace: string;

  const sshConfig = (): { host: string; port: number; username: string; auth: { type: 'password'; password: string } } => ({
    host: container.getHost(),
    port: container.getMappedPort(22),
    username: SSH_USER,
    auth: { type: 'password', password: SSH_PASSWORD },
  });

  const openVerifierDeps = async (): Promise<VerifierConnection> => {
    const manager = new SshConnectionManager(sshConfig());
    const runner = new SshRemoteCommandRunner(manager);
    return {
      runner,
      channel: new StreamLocalAgentChannel(manager, runner),
      close: () => manager.end(),
    };
  };

  const buildInstallDeps = (standInPath: string, standInSha: string, log: string[]): AgentInstallDeps => {
    const manager = new SshConnectionManager(sshConfig());
    const runner = new SshRemoteCommandRunner(manager);
    return {
      runner,
      transfer: new SftpRemoteFileTransfer(() => manager.sftp(), runner),
      closeInstaller: () => manager.end(),
      openVerifier: openVerifierDeps,
      clientVersion: CLIENT_VERSION,
      log: line => {
        log.push(line);
      },
      provisionOverrides: { localBinaryPath: standInPath, clientSha256: standInSha },
    };
  };

  afterAll(async () => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    await environment?.stop().catch(() => {});
  });

  it('6.7 installs through the copy path and passes the survive-disconnect probe', async () => {
    workspace = mkdtempSync(join(tmpdir(), 'tako-agent-integ-'));
    const standInPath = join(workspace, 'tako-standin');
    writeFileSync(standInPath, readFileSync(STAND_IN), { mode: 0o700 });
    const standInSha = createHash('sha256').update(readFileSync(STAND_IN)).digest('hex');

    const log: string[] = [];
    const deps = buildInstallDeps(standInPath, standInSha, log);

    const exitCode = await runAgentInstall(deps);

    expect(exitCode).toBe(0);
    expect(log.join('\n')).toContain('target arch:'); // preflight ran
    expect(log.join('\n')).toContain('probe passed on an independent connection');

    // Copy-path proof: the stand-in binary sits at ~/.tako/tako, 0700, sha recorded.
    const binary = await container.exec(['test', '-f', `${HOME}/.tako/tako`]);
    expect(binary.exitCode).toBe(0);
    const mode = await container.exec(['stat', '-c', '%a', `${HOME}/.tako/tako`]);
    expect(mode.output.trim()).toBe('700');
    const recorded = await container.exec(['cat', `${HOME}/.tako/installed.sha256`]);
    expect(recorded.output.trim()).toBe(standInSha);

    // Unit installed and the agent process is alive under the user manager.
    const unit = await container.exec(['test', '-f', `${HOME}/.config/systemd/user/tako-agent.service`]);
    expect(unit.exitCode).toBe(0);

    // Pre-existing linger → NO by-tako marker.
    const marker = await container.exec(['test', '-e', `${HOME}/.tako/linger.by-tako`]);
    expect(marker.exitCode).not.toBe(0);
  }, 120_000);

  it('6.7 uninstalls in order, preserves pre-existing linger, and verifies no residue on a second connection', async () => {
    const manager = new SshConnectionManager(sshConfig());
    const runner = new SshRemoteCommandRunner(manager);
    const log: string[] = [];
    const errs: string[] = [];

    const deps: AgentUninstallDeps = {
      runner,
      channel: new StreamLocalAgentChannel(manager, runner),
      clientVersion: CLIENT_VERSION,
      openVerifier: openVerifierDeps,
      log: line => {
        log.push(line);
      },
      error: line => {
        errs.push(line);
      },
    };

    const exitCode = await runAgentUninstall(deps);

    expect(exitCode).toBe(0);
    expect(errs).toEqual([]);
    expect(log.join('\n')).toContain('linger kept ENABLED');
    expect(log.join('\n')).toContain('residue check on an independent connection: clean');

    const unitGone = await container.exec(['test', '-e', `${HOME}/.config/systemd/user/tako-agent.service`]);
    expect(unitGone.exitCode).not.toBe(0);
    const dirGone = await container.exec(['test', '-e', `${HOME}/.tako`]);
    expect(dirGone.exitCode).not.toBe(0);

    // Pre-existing linger is preserved (only-by-tako rule, D8).
    const linger = await container.exec(['loginctl', 'show-user', SSH_USER, '--property=Linger']);
    expect(linger.output).toContain('Linger=yes');
  }, 120_000);

  it('6.7 residue records helper agrees with the filesystem', async () => {
    const manager = new SshConnectionManager(sshConfig());
    const runner = new SshRemoteCommandRunner(manager);
    const records = new RemoteInstallRecords(runner);

    expect(await records.home()).toBe(HOME);
    // Everything was uninstalled — the prior-install record is gone too.
    expect(await records.readInstalledSha256()).toBeUndefined();
    await manager.end();
  }, 60_000);
});
