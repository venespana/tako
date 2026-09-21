// InstallAgent.ts — use case: install pre-flight + pure distribution decisions (task 3.10)
//
// WU3 scope: the read-only PRE-FLIGHT probes over the remotes RemoteCommandRunner
// port (type-only import per ADR-0015) and the pure decision functions the
// install pipeline consumes. The execution pipeline — binary distribution,
// systemd unit + linger, survive-disconnect probe — lands with its WU4
// infrastructure adapters and the WU6 CLI composition root; those steps are
// deliberately absent here so this module stays pure and side-effect free.
//
// Probes (design §Probe Mechanics): `uname -m` arch mapping (x86_64→x64,
// aarch64→arm64, else explicit failure), init-system detection (non-systemd →
// clean refusal with ZERO mutations), linger state, KillUserProcesses (busctl
// → logind.conf fallback → unknown, warning-only per spec).
import type { RemoteCommandResult, RemoteCommandRunner } from '../../../remotes/application/RemoteCommandRunner.js';

/** Server architectures the agent supports (mirrors the release matrix). */
export type AgentArch = 'x64' | 'arm64';

/** Per-arch GitHub Releases assets (ADR-0017). */
export type ReleaseAsset = 'tako-linux-x64' | 'tako-linux-arm64';

/** Thrown when `uname -m` reports an architecture Tako cannot serve. */
export class UnsupportedArchitectureError extends Error {
  readonly arch: string;

  constructor(arch: string) {
    super(`unsupported server architecture: "${arch || '(empty)'}" (supported: x86_64, aarch64)`);
    this.name = 'UnsupportedArchitectureError';
    this.arch = arch;
  }
}

/** Map `uname -m` output to the release arch; anything else fails explicitly. */
export function mapUnameArchToAsset(unameMachine: string): AgentArch {
  if (unameMachine === 'x86_64') return 'x64';
  if (unameMachine === 'aarch64') return 'arm64';
  throw new UnsupportedArchitectureError(unameMachine);
}

/** How the binary reaches the server: direct copy when archs match, Releases asset otherwise. */
export type BinarySource =
  { readonly kind: 'copy-local-binary' } | { readonly kind: 'download-release-asset'; readonly asset: ReleaseAsset };

export function decideBinarySource(clientArch: AgentArch, serverArch: AgentArch): BinarySource {
  return clientArch === serverArch
    ? { kind: 'copy-local-binary' }
    : { kind: 'download-release-asset', asset: serverArch === 'arm64' ? 'tako-linux-arm64' : 'tako-linux-x64' };
}

/** Install-time linger decision (D8): by-Tako is recorded, never guessed. */
export interface LingerInstallDecision {
  readonly action: 'enable-linger' | 'keep-linger';
  readonly lingerEnabledByTako: boolean;
}

export function decideLingerOnInstall(preExistingLinger: boolean | 'unknown'): LingerInstallDecision {
  return preExistingLinger === true
    ? { action: 'keep-linger', lingerEnabledByTako: false }
    : { action: 'enable-linger', lingerEnabledByTako: true };
}

/** Parse `loginctl show-user … --property=Linger` output. */
export function parseLingerShowUserOutput(stdout: string): boolean | undefined {
  if (/^Linger=yes$/m.test(stdout)) return true;
  if (/^Linger=no$/m.test(stdout)) return false;
  return undefined;
}

/** Parse `busctl get-property … KillUserProcesses` output (`b true|false`). */
export function parseKillUserProcessesOutput(stdout: string): boolean | undefined {
  const trimmed = stdout.trim();
  if (trimmed === 'b true') return true;
  if (trimmed === 'b false') return false;
  return undefined;
}

/** Parse `/etc/systemd/logind.conf` fallback; commented lines are NOT values. */
export function parseKillUserProcessesConf(conf: string): boolean | undefined {
  const line = conf.split('\n').find(candidate => candidate.startsWith('KillUserProcesses='));
  const value = line?.split('=')[1]?.trim();
  if (value === 'yes' || value === 'true' || value === '1') return true;
  if (value === 'no' || value === 'false' || value === '0') return false;
  return undefined;
}

const PROBE_ARCH = 'uname -m';
const PROBE_INIT = 'ps -p 1 -o comm=';
const PROBE_COMPOSE = 'docker compose version';
const PROBE_LINGER = 'loginctl show-user "$USER" --property=Linger';
const PROBE_KILL_USER_PROCESSES =
  'busctl get-property org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager KillUserProcesses';
const PROBE_LOGIND_CONF = 'cat /etc/systemd/logind.conf';

export interface InstallPreflight {
  /** Always resolved before anything else: an unsupported arch ABORTS the preflight. */
  readonly arch: AgentArch;
  readonly systemd: boolean;
  /** The compose v2 plugin is REQUIRED (docker-compose v1 is EOL) — refusal without it. */
  readonly composeV2: boolean;
  readonly linger: boolean | 'unknown';
  /** Warning-only per spec: unknown NEVER blocks the install or the probe. */
  readonly killUserProcesses: boolean | 'unknown';
  readonly ok: boolean;
  readonly refusalReason?: string;
}

export class InstallAgent {
  constructor(private readonly runner: RemoteCommandRunner) {}

  /**
   * Read-only pre-flight. The architecture probe runs FIRST and is FATAL:
   * without a supported architecture there is no binary to ship, so the
   * preflight stops immediately with `UnsupportedArchitectureError` (or a
   * probe-failure error when `uname -m` cannot even run) instead of running
   * the remaining probes. Transport failures on the non-fatal probes degrade
   * the affected field to 'unknown'/false rather than crashing.
   */
  async checkPreflight(): Promise<InstallPreflight> {
    const unameResult = await this.tryRun(PROBE_ARCH);
    if (unameResult === undefined) {
      throw new Error('architecture probe failed: could not run "uname -m" on the target');
    }
    // Throws UnsupportedArchitectureError, naming the arch, for anything
    // outside x86_64/aarch64 — the install stops here, nothing else runs.
    const arch = mapUnameArchToAsset(unameResult.stdout.trim());

    const initResult = await this.tryRun(PROBE_INIT);
    const systemd = initResult !== undefined && initResult.exitCode === 0 && initResult.stdout.trim() === 'systemd';

    // Compose v2 plugin REQUIRED (maintainer decision 2026-09-18): lifecycle
    // jobs speak `docker compose …` only; docker-compose v1 is EOL and is
    // refused with an actionable message instead of failing at job time.
    const composeResult = await this.tryRun(PROBE_COMPOSE);
    const composeV2 = composeResult !== undefined && composeResult.exitCode === 0;

    const lingerResult = await this.tryRun(PROBE_LINGER);
    const linger =
      lingerResult !== undefined && lingerResult.exitCode === 0
        ? (parseLingerShowUserOutput(lingerResult.stdout) ?? 'unknown')
        : 'unknown';

    const busctlResult = await this.tryRun(PROBE_KILL_USER_PROCESSES);
    let killUserProcesses =
      busctlResult !== undefined && busctlResult.exitCode === 0
        ? parseKillUserProcessesOutput(busctlResult.stdout)
        : undefined;
    if (killUserProcesses === undefined) {
      const confResult = await this.tryRun(PROBE_LOGIND_CONF);
      killUserProcesses =
        confResult !== undefined && confResult.exitCode === 0
          ? parseKillUserProcessesConf(confResult.stdout)
          : undefined;
    }

    let refusalReason: string | undefined;
    if (!systemd) {
      refusalReason = 'target is not a systemd host — the agent requires systemd --user; nothing was modified';
    } else if (!composeV2) {
      refusalReason =
        'the docker compose v2 plugin is required (docker-compose v1 is EOL) — install the compose plugin and retry; nothing was modified';
    }

    return {
      arch,
      systemd,
      composeV2,
      linger,
      killUserProcesses: killUserProcesses ?? 'unknown',
      ok: systemd && composeV2,
      ...(refusalReason !== undefined && { refusalReason }),
    };
  }

  /** Run a probe; transport failures become probe failures, never exceptions. */
  private async tryRun(command: string): Promise<RemoteCommandResult | undefined> {
    try {
      return await this.runner.run(command);
    } catch {
      return undefined;
    }
  }
}
