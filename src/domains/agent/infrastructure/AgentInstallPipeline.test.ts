// infrastructure/AgentInstallPipeline.test.ts — the agent install flow over
// ports (tasks 6.3, 6.6, 6.8, 9.10/9.11 follow-ups; shared by the CLI handler
// and the TUI's in-process install since 9.19). Tests inject scripted ports
// and assert the orchestration: refusal messages verbatim from preflight,
// exit codes, KillUserProcesses warning path, polkit denial surfacing, and
// the absolute (home-resolved) SFTP staging path from task 6.8.
import { Duplex } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { runAgentInstall, type AgentInstallDeps } from './AgentInstallPipeline.js';
import type { VerifierConnection } from './SurviveDisconnectProber.js';
import type { AgentChannel } from '../../remotes/application/AgentChannel.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import type { RemoteFileTransfer, RemoteUploadRequest } from '../../remotes/application/RemoteFileTransfer.js';
import { decideClientInstallSource } from '../application/use-cases/InstallAgent.js';
import { helloAckFrame, responseFrame } from '../domain/protocol.js';

const CLIENT_VERSION = '0.1.2';
const LOCAL_SHA = 'c'.repeat(64);
const PRIOR_SHA = 'd'.repeat(64);
const FOREIGN_SHA = 'e'.repeat(64);

const OK = (stdout = ''): RemoteCommandResult => ({ stdout, stderr: '', exitCode: 0 });
const FAIL = (stderr = 'failed', exitCode = 1): RemoteCommandResult => ({ stdout: '', stderr, exitCode });

class ScriptedRunner implements RemoteCommandRunner {
  readonly calls: string[] = [];

  constructor(private readonly respond: (command: string) => RemoteCommandResult) {}

  async run(command: string): Promise<RemoteCommandResult> {
    this.calls.push(command);
    return this.respond(command);
  }
}

/** Duplex speaking the agent protocol just enough for the probe handshake. */
class HandshakeChannel extends Duplex implements AgentChannel {
  readonly #version: string;

  constructor(version: string) {
    super({ objectMode: true });
    this.#version = version;
  }

  override _read(): void {}

  override _write(frame: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const parsed = JSON.parse(String(frame)) as { kind: string; id?: string; type?: string };

    if (parsed.kind === 'hello') {
      this.push(JSON.stringify(helloAckFrame(this.#version, 'start-1')));
    } else if (parsed.kind === 'request' && parsed.id !== undefined) {
      this.push(
        JSON.stringify(
          responseFrame(parsed.id, 'agent.status', {
            agentVersion: this.#version,
            protocol: 1,
            uptimeSec: 1,
            jobCount: 0,
            unitState: 'active',
            linger: true,
            lingerByTako: false,
          })
        )
      );
    }

    callback();
  }

  async open(): Promise<Duplex> {
    return this;
  }

  async close(): Promise<void> {}
}

class FakeTransfer implements RemoteFileTransfer {
  readonly uploads: RemoteUploadRequest[] = [];

  async upload(request: RemoteUploadRequest): Promise<{ bytes: number; sha256: string }> {
    this.uploads.push(request);
    return { bytes: 1, sha256: LOCAL_SHA };
  }

  async download(): Promise<never> {
    throw new Error('download not used in this test');
  }
}

interface Harness {
  readonly deps: AgentInstallDeps;
  readonly runner: ScriptedRunner;
  readonly transfer: FakeTransfer;
  readonly verifierCommands: string[];
  readonly closedInstaller: () => number;
  readonly verifierCloses: () => number;
}

function happyResponses(command: string, overrides: Record<string, RemoteCommandResult> = {}): RemoteCommandResult {
  const table: Record<string, RemoteCommandResult> = {
    'uname -m': OK('x86_64\n'),
    'ps -p 1 -o comm=': OK('systemd\n'),
    'docker compose version': OK('Docker Compose version v2.27.0\n'),
    'loginctl show-user "$USER" --property=Linger': OK('Linger=no\n'),
    'busctl get-property org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager KillUserProcesses':
      FAIL('busctl: not found', 127),
    'cat /etc/systemd/logind.conf': OK('#KillUserProcesses=no\n'),
    'printf %s "$HOME"': OK('/home/ops'),
    "sha256sum '/home/ops/.tako/tako.new'": OK(`${LOCAL_SHA}  /home/ops/.tako/tako.new`),
    "sha256sum '/home/ops/.tako/tako'": FAIL('No such file or directory'),
    "cat '/home/ops/.tako/installed.sha256'": FAIL('No such file or directory'),
  };

  // Overrides take priority over the happy-path table; first matching entry wins.
  const hit = [...Object.entries(overrides), ...Object.entries(table)].find(([needle]) => command.includes(needle));

  return hit === undefined ? OK() : hit[1];
}

function createHarness(overrides: Record<string, RemoteCommandResult> = {}): Harness {
  const runner = new ScriptedRunner(command => happyResponses(command, overrides));
  const transfer = new FakeTransfer();
  const verifierCommands: string[] = [];
  let installerCloses = 0;
  let verifierCloseCount = 0;

  const deps: AgentInstallDeps = {
    runner,
    transfer,
    closeInstaller: async () => {
      installerCloses += 1;
    },
    openVerifier: async (): Promise<VerifierConnection> => {
      const verifierRunner = new ScriptedRunner(command => {
        verifierCommands.push(command);

        if (command.includes('systemctl --user is-active')) return OK('active\n');

        return OK();
      });
      return {
        runner: verifierRunner,
        channel: new HandshakeChannel(CLIENT_VERSION),
        close: async () => {
          verifierCloseCount += 1;
        },
      };
    },
    clientVersion: CLIENT_VERSION,
    proberOptions: { delays: { afterCloseMs: 0, pollIntervalMs: 0 }, maxPollAttempts: 1, sleep: async () => {} },
    provisionOverrides: { clientSha256: LOCAL_SHA },
  };

  return {
    deps,
    runner,
    transfer,
    verifierCommands,
    closedInstaller: () => installerCloses,
    verifierCloses: () => verifierCloseCount,
  };
}

interface CapturedDeps extends AgentInstallDeps {
  readonly logLines: string[];
  readonly errorLines: string[];
}

function capture(deps: AgentInstallDeps): CapturedDeps {
  const logLines: string[] = [];
  const errorLines: string[] = [];
  return {
    ...deps,
    log: line => {
      logLines.push(line);
    },
    error: line => {
      errorLines.push(line);
    },
    logLines,
    errorLines,
  };
}

describe('runAgentInstall — refusal paths', () => {
  it('6.3 RED: non-systemd target → exit 1 with the preflight refusal message verbatim, zero mutations', async () => {
    const harness = createHarness({
      'ps -p 1 -o comm=': OK('init\n'),
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(1);
    expect(captured.errorLines.at(-1)).toBe(
      'target is not a systemd host — the agent requires systemd --user; nothing was modified'
    );
    const mutations = harness.runner.calls.filter(
      call => call.includes('mkdir -p') || call.includes('systemctl') || call.includes('loginctl enable-linger')
    );
    expect(mutations).toEqual([]);
  });

  it('6.3 RED: compose v2 plugin absent → exit 1 with the compose refusal message verbatim', async () => {
    const harness = createHarness({
      'docker compose version': FAIL('docker: compose is not a docker command', 1),
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(1);
    expect(captured.errorLines.at(-1)).toBe(
      'the docker compose v2 plugin is required (docker-compose v1 is EOL) — install the compose plugin and retry; nothing was modified'
    );
  });

  it('6.6 RED: unsupported architecture → exit 1 naming the arch', async () => {
    const harness = createHarness({
      'uname -m': OK('armv7l\n'),
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(1);
    expect(captured.errorLines.join('\n')).toContain('armv7l');
  });
});

describe('runAgentInstall — warnings that do NOT block', () => {
  it('6.6 RED: KillUserProcesses=yes is reported as a warning and the install still runs the probe', async () => {
    const harness = createHarness({
      'cat /etc/systemd/logind.conf': OK('KillUserProcesses=yes\n'),
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(0);
    expect(captured.logLines.some(line => line.includes('KillUserProcesses') && line.includes('enabled'))).toBe(true);
    expect(harness.verifierCommands.some(command => command.includes('systemctl --user is-active'))).toBe(true);
  });
});

describe('runAgentInstall — linger and polkit', () => {
  it('6.6 RED: polkit linger denial → exit 1 with the polkit action and sudo remedy in the message', async () => {
    const harness = createHarness({
      'loginctl enable-linger': FAIL('Not authorized', 1),
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(1);
    const output = captured.errorLines.join('\n');
    expect(output).toContain('org.freedesktop.login1.set-self-linger');
    expect(output).toContain('sudo loginctl enable-linger');
  });

  it('6.4 RED: linger enabled by Tako is recorded (marker), pre-existing linger is not re-recorded', async () => {
    const harness = createHarness();
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(0);
    expect(harness.runner.calls).toContainEqual("printf '1' > '/home/ops/.tako/linger.by-tako'");
    expect(captured.logLines.some(line => line.includes('linger enabled by Tako'))).toBe(true);

    // Pre-existing linger: no by-tako marker write.
    const keepHarness = createHarness({
      'loginctl show-user "$USER" --property=Linger': OK('Linger=yes\n'),
    });
    await runAgentInstall(keepHarness.deps);
    expect(keepHarness.runner.calls.some(call => call.includes('linger.by-tako'))).toBe(false);
  });

  it('6.4 fix: linger-marker write failure compensates by disabling linger again (never enabled-but-unrecorded)', async () => {
    const harness = createHarness({
      "printf '1' > '/home/ops/.tako/linger.by-tako'": FAIL('disk full', 1),
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(1);
    // Compensation: the enable is rolled back so no enabled-but-unrecorded linger survives.
    expect(harness.runner.calls).toContainEqual('loginctl disable-linger');
    const output = captured.errorLines.join('\n');
    expect(output).toMatch(/linger disabled again to restore the pre-install state/);
  });

  // 9.10 follow-up (real-world finding on homeserver): the placement sha must
  // be recorded BEFORE unit/enable — a failed enable used to strand a
  // Tako-placed binary with no witness, and the retry refused it as a decoy.
  it('9.10 fix: placement sha is recorded BEFORE the enable step (failed enable leaves a retryable witness)', async () => {
    const harness = createHarness({
      'systemctl --user enable --now tako-agent.service': FAIL('unit failed to activate', 1),
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(1);
    const shaWriteIndex = harness.runner.calls.findIndex(
      call => call.includes('installed.sha256') && call.includes('printf')
    );
    const enableIndex = harness.runner.calls.findIndex(call => call.includes('enable --now tako-agent'));
    expect(shaWriteIndex).toBeGreaterThan(-1);
    expect(enableIndex).toBeGreaterThan(shaWriteIndex);
  });

  // 9.11 (real-world finding on homeserver): a binary built on a newer distro
  // than the target dies with a GLIBC error — the install must abort BEFORE
  // any unit/linger mutation, naming the missing glibc version.
  it('9.11: a placed binary that cannot execute (GLIBC mismatch) aborts before unit mutations', async () => {
    const harness = createHarness({
      "'/home/ops/.tako/tako' --version": {
        stdout: '',
        stderr:
          "/home/venespana/.tako/tako: /usr/lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.44' not found (required by /home/venespana/.tako/tako)",
        exitCode: 1,
      },
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(1);
    const output = captured.errorLines.join('\n');
    expect(output).toMatch(/GLIBC_2\.44/);
    expect(output).toMatch(/older than the build machine's/);
    expect(output).toMatch(/nothing else was modified/);
    // Fatal: no unit or linger mutation may happen for a non-runnable binary.
    expect(harness.runner.calls.some(call => call.includes('systemd/user'))).toBe(false);
    expect(harness.runner.calls.some(call => call.includes('enable-linger'))).toBe(false);
  });

  it('9.7 RED: unreadable linger state still enables linger but does NOT write the by-tako marker', async () => {
    const harness = createHarness({
      'loginctl show-user "$USER" --property=Linger': FAIL('could not read state', 1),
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(0);
    // Linger IS enabled (the agent needs it to survive logout)…
    expect(harness.runner.calls).toContainEqual('loginctl enable-linger');
    // …but the by-tako marker is NOT written (the flag is never guessed).
    expect(harness.runner.calls.some(call => call.includes('linger.by-tako'))).toBe(false);
    expect(captured.logLines.some(line => line.includes('NOT recorded as Tako-enabled'))).toBe(true);
  });
});

describe('runAgentInstall — 9.12 Releases fallback + 9.13 stale-unit restart', () => {
  // 9.12: when the copy-path binary cannot execute (GLIBC floor), the
  // per-arch Releases asset is downloaded through the SAME fallback path the
  // arch mismatch uses, and the probe re-runs on the downloaded binary.
  it('9.12: probe fails → Releases download succeeds → re-probe passes → install completes', async () => {
    const DOWNLOAD_SHA = 'f'.repeat(64);
    const harness = createHarness();
    // Phase the fake on the number of runnability probes: probe #1 is the
    // copy-path binary (GLIBC failure); from the record re-read onward the
    // fallback phase is live; probe #2 sees the downloaded binary (pass).
    let probes = 0;
    const stateful = new ScriptedRunner(command => {
      const isProbe = command === "'/home/ops/.tako/tako' --version";

      if (isProbe) probes += 1;

      const fallbackPhase = probes >= 1;
      const fallbackPlaced = probes >= 2;
      return happyResponses(command, {
        "'/home/ops/.tako/tako' --version": fallbackPlaced
          ? OK('tako agent 0.1.2\n')
          : {
              stdout: '',
              stderr:
                "/home/ops/.tako/tako: /usr/lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.44' not found (required by /home/ops/.tako/tako)",
              exitCode: 1,
            },
        "sha256sum '/home/ops/.tako/tako.new'": fallbackPhase
          ? OK(`${DOWNLOAD_SHA}  /home/ops/.tako/tako.new`)
          : OK(`${LOCAL_SHA}  /home/ops/.tako/tako.new`),
        "sha256sum '/home/ops/.tako/tako'": fallbackPhase
          ? OK(`${LOCAL_SHA}  /home/ops/.tako/tako`)
          : FAIL('No such file or directory'),
        "cat '/home/ops/.tako/tako.new.sha256'": OK(`${DOWNLOAD_SHA}  tako-linux-x64`),
        "cat '/home/ops/.tako/installed.sha256'": fallbackPhase
          ? OK(`${LOCAL_SHA}  /home/ops/.tako/installed.sha256`)
          : FAIL('No such file or directory'),
      });
    });
    const captured = capture({ ...harness.deps, runner: stateful });

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(0);
    // The fallback downloaded the per-arch asset for the SERVER arch…
    expect(stateful.calls).toContainEqual(
      "curl -fsSL 'https://github.com/venespana/tako/releases/download/v0.1.2/tako-linux-x64' -o '/home/ops/.tako/tako.new'"
    );
    // …the runnability probe ran on BOTH binaries (copy, then downloaded)…
    expect(stateful.calls.filter(call => call === "'/home/ops/.tako/tako' --version")).toHaveLength(2);
    // …the flow continued past runnability (unit enabled, probe ran).
    expect(stateful.calls.some(call => call.includes('enable --now tako-agent'))).toBe(true);
    expect(captured.logLines.some(line => line.includes('Releases fallback'))).toBe(true);
  });

  it('9.12: download succeeds but the re-probe on the downloaded binary fails → explicit both-fail error', async () => {
    const DOWNLOAD_SHA = 'e'.repeat(64);
    const harness = createHarness();
    let probes = 0;
    const stateful = new ScriptedRunner(command => {
      const isProbe = command === "'/home/ops/.tako/tako' --version";

      if (isProbe) probes += 1;

      const fallbackPhase = probes >= 1;
      const fallbackPlaced = probes >= 2;
      return happyResponses(command, {
        "'/home/ops/.tako/tako' --version": fallbackPlaced
          ? FAIL('cannot execute binary file: Exec format error')
          : {
              stdout: '',
              stderr:
                "/home/ops/.tako/tako: /usr/lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.44' not found (required by /home/ops/.tako/tako)",
              exitCode: 1,
            },
        "sha256sum '/home/ops/.tako/tako.new'": fallbackPhase
          ? OK(`${DOWNLOAD_SHA}  /home/ops/.tako/tako.new`)
          : OK(`${LOCAL_SHA}  /home/ops/.tako/tako.new`),
        "sha256sum '/home/ops/.tako/tako'": fallbackPhase
          ? OK(`${LOCAL_SHA}  /home/ops/.tako/tako`)
          : FAIL('No such file or directory'),
        "cat '/home/ops/.tako/tako.new.sha256'": OK(`${DOWNLOAD_SHA}  tako-linux-x64`),
        "cat '/home/ops/.tako/installed.sha256'": fallbackPhase
          ? OK(`${LOCAL_SHA}  /home/ops/.tako/installed.sha256`)
          : FAIL('No such file or directory'),
      });
    });
    const captured = capture({ ...harness.deps, runner: stateful });

    const exitCode = await runAgentInstall(captured);

    console.log('DEBUG calls:', JSON.stringify(stateful.calls));
    console.log('DEBUG errorLines:', JSON.stringify(captured.errorLines));
    expect(exitCode).toBe(1);
    // The downloaded binary was placed and probed…
    expect(stateful.calls.filter(call => call === "'/home/ops/.tako/tako' --version")).toHaveLength(2);
    // …and the explicit error names BOTH attempted paths.
    const output = captured.errorLines.join('\n');
    expect(output).toMatch(/Copy path/);
    expect(output).toMatch(/Releases fallback/);
  });

  it('9.12: probe fails AND the Releases download fails → explicit error naming arch + both attempted paths', async () => {
    const harness = createHarness();
    const stateful = new ScriptedRunner(command =>
      happyResponses(command, {
        'curl -fsSL': FAIL('curl: (22) The requested URL returned error: 404'),
        "'/home/ops/.tako/tako' --version": {
          stdout: '',
          stderr:
            "/home/ops/.tako/tako: /usr/lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.44' not found (required by /home/ops/.tako/tako)",
          exitCode: 1,
        },
      })
    );
    const captured = capture({ ...harness.deps, runner: stateful });

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(1);
    const output = captured.errorLines.join('\n');
    expect(output).toContain('arch x64');
    expect(output).toContain('Copy path');
    expect(output).toContain('Releases fallback (tako-linux-x64)');
    expect(output).toContain('GLIBC_2.44');
    // Still fatal before any unit/linger mutation (9.11 semantics preserved).
    expect(stateful.calls.some(call => call.includes('systemd/user'))).toBe(false);
    expect(stateful.calls.some(call => call.includes('enable-linger'))).toBe(false);
  });

  // 9.13: `enable --now` no-ops on an ACTIVE unit — the stale-unit scenario
  // (orphan process serving a deleted socket) must be revived by try-restart.
  it('9.13: an ALREADY-ACTIVE unit is try-restarted; enable --now is skipped', async () => {
    const harness = createHarness({
      'systemctl --user is-active tako-agent.service': OK('active\n'),
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(0);
    expect(harness.runner.calls).toContainEqual('systemctl --user try-restart tako-agent.service');
    expect(harness.runner.calls.some(call => call.includes('enable --now tako-agent'))).toBe(false);
    expect(captured.logLines.some(line => line.includes('was already active'))).toBe(true);
  });

  it('9.13: a fresh (inactive) unit still gets enable --now, never try-restart', async () => {
    const harness = createHarness();

    const exitCode = await runAgentInstall(harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.runner.calls).toContainEqual('systemctl --user enable --now tako-agent.service');
    expect(harness.runner.calls.some(call => call.includes('try-restart'))).toBe(false);
  });
});

describe('runAgentInstall — happy path and 6.8 tilde resolution', () => {
  it('6.8 RED: upload goes to an ABSOLUTE home-resolved staging path (sftp does not expand ~)', async () => {
    const harness = createHarness();

    const exitCode = await runAgentInstall(harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.transfer.uploads).toHaveLength(1);
    expect(harness.transfer.uploads[0]?.remotePath).toBe('/home/ops/.tako/tako.new');
    expect(harness.transfer.uploads[0]?.remotePath.startsWith('~')).toBe(false);
  });

  it('6.6 RED: prior-install sha256 is read BEFORE provisioning and after a successful copy the record is written', async () => {
    const harness = createHarness({
      "cat '/home/ops/.tako/installed.sha256'": OK(`${PRIOR_SHA}  /home/ops/.tako/installed.sha256`),
      "sha256sum '/home/ops/.tako/tako'": OK(`${PRIOR_SHA}  /home/ops/.tako/tako`),
    });

    const exitCode = await runAgentInstall(harness.deps);

    expect(exitCode).toBe(0);
    const readIndex = harness.runner.calls.findIndex(call => call.includes('cat') && call.includes('installed.sha256'));
    const firstShaIndex = harness.runner.calls.findIndex(call => call.includes('sha256sum'));
    const mkdirIndex = harness.runner.calls.findIndex(call => call === "mkdir -p '/home/ops/.tako'");
    expect(readIndex).toBeGreaterThanOrEqual(0);
    expect(readIndex).toBeLessThan(firstShaIndex);
    expect(mkdirIndex).toBeGreaterThan(readIndex);
    expect(
      harness.runner.calls.some(call =>
        call.startsWith(`printf '%s' '${LOCAL_SHA}' > '/home/ops/.tako/installed.sha256'`)
      )
    ).toBe(true);
  });

  it('6.6 RED: decoy binary at the target → explicit refusal, never replaced', async () => {
    const harness = createHarness({
      "sha256sum '/home/ops/.tako/tako'": OK(`${FOREIGN_SHA}  /home/ops/.tako/tako`),
    });
    const captured = capture(harness.deps);

    const exitCode = await runAgentInstall(captured);

    expect(exitCode).toBe(1);
    expect(captured.errorLines.join('\n')).toContain('decoy');
  });

  it('6.6 RED: installer connection is fully closed exactly once even on success', async () => {
    const harness = createHarness();

    await runAgentInstall(harness.deps);

    expect(harness.closedInstaller()).toBe(1);
    expect(harness.verifierCloses()).toBe(1);
  });
});

describe('decideClientInstallSource — 6.6 client platform/arch mapping', () => {
  it('copy path on linux with matching arch', () => {
    expect(decideClientInstallSource('linux', 'x64', 'x64')).toEqual({ kind: 'copy-local-binary' });
    expect(decideClientInstallSource('linux', 'arm64', 'arm64')).toEqual({ kind: 'copy-local-binary' });
  });

  it('download path on arch mismatch', () => {
    expect(decideClientInstallSource('linux', 'x64', 'arm64')).toEqual({
      kind: 'download-release-asset',
      asset: 'tako-linux-arm64',
    });
  });

  it('never copies a non-linux binary to a linux server', () => {
    expect(decideClientInstallSource('darwin', 'arm64', 'arm64')).toEqual({
      kind: 'download-release-asset',
      asset: 'tako-linux-arm64',
    });
    expect(decideClientInstallSource('win32', 'x64', 'x64')).toEqual({
      kind: 'download-release-asset',
      asset: 'tako-linux-x64',
    });
  });
});
