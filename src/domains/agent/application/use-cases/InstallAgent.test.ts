// application/use-cases/InstallAgent.test.ts — STRICT TDD RED phase (task 3.10, 3.11)
import { describe, it, expect } from 'vitest';
// RED: import the modules that don't exist yet
import {
  InstallAgent,
  mapUnameArchToAsset,
  decideBinarySource,
  decideLingerOnInstall,
  parseLingerShowUserOutput,
  parseKillUserProcessesOutput,
  parseKillUserProcessesConf,
  UnsupportedArchitectureError,
} from './InstallAgent.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../../../remotes/application/RemoteCommandRunner.js';

function ok(stdout: string): RemoteCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

/** Scripted fake runner: keys on exact command strings, records every call. */
class FakeRunner implements RemoteCommandRunner {
  readonly calls: string[] = [];

  constructor(private readonly script: Record<string, RemoteCommandResult>) {}

  async run(command: string): Promise<RemoteCommandResult> {
    this.calls.push(command);
    const result = this.script[command];
    if (!result) throw new Error(`unexpected command: ${command}`);
    return result;
  }
}

const UNAME = 'uname -m';
const INIT = 'ps -p 1 -o comm=';
const COMPOSE = 'docker compose version';
const LINGER = 'loginctl show-user "$USER" --property=Linger';
const BUSCTL =
  'busctl get-property org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager KillUserProcesses';
const LOGIND_CONF = 'cat /etc/systemd/logind.conf';

describe('mapUnameArchToAsset (task 3.11)', () => {
  it('3.11 RED: x86_64 → x64', () => {
    expect(mapUnameArchToAsset('x86_64')).toBe('x64');
  });

  it('3.11 RED: aarch64 → arm64', () => {
    expect(mapUnameArchToAsset('aarch64')).toBe('arm64');
  });

  it('3.11 RED: any other arch fails explicitly, naming it', () => {
    expect(() => mapUnameArchToAsset('armv7l')).toThrow(UnsupportedArchitectureError);
    expect(() => mapUnameArchToAsset('armv7l')).toThrow(/armv7l/);
    expect(() => mapUnameArchToAsset('')).toThrow(UnsupportedArchitectureError);
  });
});

describe('decideBinarySource (design §Probe Mechanics distribution)', () => {
  it('3.10 RED: matching arch → copy the local binary over SFTP', () => {
    expect(decideBinarySource('x64', 'x64')).toEqual({ kind: 'copy-local-binary' });
    expect(decideBinarySource('arm64', 'arm64')).toEqual({ kind: 'copy-local-binary' });
  });

  it('3.10 RED: mismatch → download the server-arch Releases asset', () => {
    expect(decideBinarySource('x64', 'arm64')).toEqual({ kind: 'download-release-asset', asset: 'tako-linux-arm64' });
    expect(decideBinarySource('arm64', 'x64')).toEqual({ kind: 'download-release-asset', asset: 'tako-linux-x64' });
  });
});

describe('linger decision (task 3.11, D8)', () => {
  it('3.11 RED: pre-existing linger → keep, NOT marked as by-Tako', () => {
    expect(decideLingerOnInstall(true)).toEqual({ action: 'keep-linger', lingerEnabledByTako: false });
  });

  it('3.11 RED: no pre-existing linger → enable AND record by-Tako', () => {
    expect(decideLingerOnInstall(false)).toEqual({ action: 'enable-linger', lingerEnabledByTako: true });
  });

  it("9.7 RED: unknown linger state → attempt enable (idempotent) but NOT recorded as by-Tako — the flag is never guessed", () => {
    // Recording by-tako=true on an unreadable state risks disabling a
    // pre-existing (user-owned) linger at uninstall — the only-by-tako rule
    // (design D8, uninstall) tolerates kept linger, never guessed teardown.
    expect(decideLingerOnInstall('unknown')).toEqual({ action: 'enable-linger', lingerEnabledByTako: false });
  });
});

describe('parsers', () => {
  it('3.10 RED: loginctl Linger output parses to true/false/unknown', () => {
    expect(parseLingerShowUserOutput('Linger=yes\n')).toBe(true);
    expect(parseLingerShowUserOutput('Linger=no\n')).toBe(false);
    expect(parseLingerShowUserOutput('Could not get property\n')).toBeUndefined();
    expect(parseLingerShowUserOutput('')).toBeUndefined();
  });

  it('3.10 RED: busctl KillUserProcesses output parses to true/false/unknown', () => {
    expect(parseKillUserProcessesOutput('b true\n')).toBe(true);
    expect(parseKillUserProcessesOutput('b false\n')).toBe(false);
    expect(parseKillUserProcessesOutput('gibberish')).toBeUndefined();
  });

  it('3.10 RED: logind.conf fallback parses uncommented values only', () => {
    expect(parseKillUserProcessesConf('KillUserProcesses=yes\n')).toBe(true);
    expect(parseKillUserProcessesConf('#KillUserProcesses=no\n')).toBeUndefined(); // commented default
    expect(parseKillUserProcessesConf('Other=1\n')).toBeUndefined();
  });
});

describe('InstallAgent.checkPreflight', () => {
  it('3.10 RED: happy path reads arch, init system, compose v2, linger and KillUserProcesses', async () => {
    const runner = new FakeRunner({
      [UNAME]: ok('x86_64\n'),
      [INIT]: ok('systemd\n'),
      [COMPOSE]: ok('Docker Compose version v2.29.7\n'),
      [LINGER]: ok('Linger=no\n'),
      [BUSCTL]: ok('b false\n'),
    });

    const preflight = await new InstallAgent(runner).checkPreflight();

    expect(preflight).toEqual({
      arch: 'x64',
      systemd: true,
      composeV2: true,
      linger: false,
      killUserProcesses: false,
      ok: true,
      refusalReason: undefined,
    });
    expect(runner.calls).toEqual([UNAME, INIT, COMPOSE, LINGER, BUSCTL]); // read-only probes, in order
  });

  it('3.10 fix: missing compose v2 plugin → refusal with actionable message, zero mutations', async () => {
    const runner = new FakeRunner({
      [UNAME]: ok('x86_64\n'),
      [INIT]: ok('systemd\n'),
      [COMPOSE]: { stdout: '', stderr: "docker: 'compose' is not a docker command", exitCode: 1 },
      [LINGER]: ok('Linger=no\n'),
    });

    const preflight = await new InstallAgent(runner).checkPreflight();

    expect(preflight.ok).toBe(false);
    expect(preflight.composeV2).toBe(false);
    expect(preflight.refusalReason).toMatch(/compose v2 plugin is required/);
  });

  it('3.10 fix: compose probe transport failure counts as NOT available (certainty required)', async () => {
    const runner = new FakeRunner({
      [UNAME]: ok('x86_64\n'),
      [INIT]: ok('systemd\n'),
      // COMPOSE missing from the script → runner throws → probe unknown
      [LINGER]: ok('Linger=no\n'),
    });

    const preflight = await new InstallAgent(runner).checkPreflight();

    expect(preflight.composeV2).toBe(false);
    expect(preflight.ok).toBe(false);
    expect(preflight.refusalReason).toMatch(/compose v2 plugin is required/);
  });

  it('3.10 RED: non-systemd host → refusal with zero mutations implied, arch still reported', async () => {
    const runner = new FakeRunner({
      [UNAME]: ok('aarch64\n'),
      [INIT]: ok('openrc-init\n'),
    });

    const preflight = await new InstallAgent(runner).checkPreflight();

    expect(preflight.ok).toBe(false);
    expect(preflight.refusalReason).toMatch(/systemd/);
    expect(preflight.arch).toBe('arm64');
    expect(preflight.systemd).toBe(false);
  });

  it('3.10 RED: busctl failure falls back to logind.conf parsing', async () => {
    const runner = new FakeRunner({
      [UNAME]: ok('x86_64\n'),
      [INIT]: ok('systemd\n'),
      [LINGER]: ok('Linger=yes\n'),
      [BUSCTL]: { stdout: '', stderr: 'no such unit', exitCode: 1 },
      [LOGIND_CONF]: ok('#KillUserProcesses=no\nKillUserProcesses=yes\n'),
    });

    const preflight = await new InstallAgent(runner).checkPreflight();

    expect(preflight.killUserProcesses).toBe(true); // from the uncommented conf line
  });

  it('3.10 RED: KillUserProcesses unknown when every source fails — warning only, still ok', async () => {
    const runner = new FakeRunner({
      [UNAME]: ok('x86_64\n'),
      [INIT]: ok('systemd\n'),
      [COMPOSE]: ok('Docker Compose version v2.29.7\n'),
      [LINGER]: ok('Linger=yes\n'),
      [BUSCTL]: { stdout: '', stderr: 'boom', exitCode: 1 },
      [LOGIND_CONF]: ok(''),
    });

    const preflight = await new InstallAgent(runner).checkPreflight();

    expect(preflight.killUserProcesses).toBe('unknown');
    expect(preflight.ok).toBe(true); // probe still executes per spec
  });

  it('3.10 fix: unsupported architecture STOPS the preflight immediately, naming the arch', async () => {
    const runner = new FakeRunner({
      [UNAME]: ok('riscv64\n'),
      [INIT]: ok('systemd\n'),
    });

    await expect(new InstallAgent(runner).checkPreflight()).rejects.toThrow(UnsupportedArchitectureError);
    // Fatal verdict: no probe runs after the unsupported-arch answer.
    expect(runner.calls).toEqual([UNAME]);
  });

  it('3.10 fix: arch probe transport failure also stops the preflight (no binary can be chosen)', async () => {
    const runner = new FakeRunner({
      [INIT]: ok('systemd\n'), // would succeed, but must never be reached
    });

    await expect(new InstallAgent(runner).checkPreflight()).rejects.toThrow(/architecture probe failed/);
    expect(runner.calls).toEqual([UNAME]);
  });
});
