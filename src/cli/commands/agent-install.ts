// cli/commands/agent-install.ts — CLI handler for `tako agent install <remote>` (tasks 6.3, 6.8)
//
// Thin orchestration over the agent domain (design §Agent Subcommands):
// preflight (InstallAgent) → hybrid binary distribution (HybridBinaryProvisioner)
// → systemd unit + linger (SystemdRemoteController) → mandatory
// survive-disconnect probe (SurviveDisconnectProber). Decisions live in the
// use cases; this handler composes adapters, prints plain console output,
// and maps outcomes to exit codes (0 ok, 1 refusal/failure).
//
// Linger recording (design D8): when TAKO enables linger here, the by-tako
// marker is written through RemoteInstallRecords so the agent's status()
// and any later uninstall trust a RECORDED flag instead of guessing.
import {
  decideBinarySource,
  decideLingerOnInstall,
  InstallAgent,
  UnsupportedArchitectureError,
  type AgentArch,
  type BinarySource,
  type InstallPreflight,
} from '../../domains/agent/application/use-cases/InstallAgent.js';
import { RemoteInstallRecords } from '../../domains/agent/infrastructure/AgentInstallRecords.js';
import { HybridBinaryProvisioner } from '../../domains/agent/infrastructure/HybridBinaryProvisioner.js';
import {
  SurviveDisconnectProber,
  type VerifierConnection,
} from '../../domains/agent/infrastructure/SurviveDisconnectProber.js';
import { SystemdRemoteController } from '../../domains/agent/infrastructure/SystemdRemoteController.js';
import type { RemoteCommandRunner } from '../../domains/remotes/application/RemoteCommandRunner.js';
import type { RemoteFileTransfer } from '../../domains/remotes/application/RemoteFileTransfer.js';
import { VERSION } from '../../shared/lib/version.js';

/** Distribution decision for the RUNNING client binary (never copy cross-OS). */
export function decideClientInstallSource(
  clientPlatform: string,
  clientArch: string,
  serverArch: AgentArch
): BinarySource {
  if (clientPlatform !== 'linux') {
    // A non-linux client binary cannot run on the server even when the CPU
    // arch matches — force the per-arch Releases download path.
    const mismatchedClientArch: AgentArch = serverArch === 'arm64' ? 'x64' : 'arm64';
    return decideBinarySource(mismatchedClientArch, serverArch);
  }
  const client = clientArch === 'arm64' ? 'arm64' : 'x64';
  return decideBinarySource(client, serverArch);
}

const KUP_TRUE_WARNING =
  'KillUserProcesses is enabled on the target: the user manager may kill the agent when the installing session logs out — the survive-disconnect probe still runs and will detect it';
const KUP_UNKNOWN_WARNING =
  'KillUserProcesses could not be determined on the target — the survive-disconnect probe still runs and will detect any problem';

export interface AgentInstallDeps {
  /** Connection A: the installing session's exec channel. */
  readonly runner: RemoteCommandRunner;
  /** Connection A: SFTP transfer for the copy path. */
  readonly transfer: RemoteFileTransfer;
  /** Fully close the installing session (prober requires it). */
  readonly closeInstaller: () => Promise<void>;
  /** Open a fresh, INDEPENDENT verification connection (connection B). */
  readonly openVerifier: () => Promise<VerifierConnection>;
  readonly clientVersion: string;
  readonly log?: (line: string) => void;
  readonly error?: (line: string) => void;
  /** Test seam: probe pacing (production uses the design defaults). */
  readonly proberOptions?: {
    readonly delays?: { readonly afterCloseMs?: number; readonly pollIntervalMs?: number };
    readonly maxPollAttempts?: number;
    readonly sleep?: (ms: number) => Promise<void>;
  };
  /** Test seam: pin the copy-path local binary/sha instead of process.execPath. */
  readonly provisionOverrides?: {
    readonly localBinaryPath?: string;
    readonly clientSha256?: string;
  };
}

export async function runAgentInstall(deps: AgentInstallDeps): Promise<number> {
  const log = deps.log ?? (line => console.log(line));
  const error = deps.error ?? (line => console.error(line));
  const records = new RemoteInstallRecords(deps.runner);
  let proberRan = false;

  try {
    // 1. Preflight — arch probe is fatal-first; refusals leave zero mutations.
    let preflight: InstallPreflight;
    try {
      preflight = await new InstallAgent(deps.runner).checkPreflight();
    } catch (probeError) {
      if (probeError instanceof UnsupportedArchitectureError) {
        error(probeError.message);
      } else {
        error(`install preflight failed: ${probeError instanceof Error ? probeError.message : String(probeError)}`);
      }
      return 1;
    }

    log(`target arch: ${preflight.arch}`);
    log(`systemd --user: ${preflight.systemd ? 'available' : 'missing'}`);
    log(`docker compose v2: ${preflight.composeV2 ? 'available' : 'missing'}`);
    log(`linger: ${preflight.linger === 'unknown' ? 'unknown' : preflight.linger ? 'enabled' : 'disabled'}`);
    if (preflight.killUserProcesses === true) log(`warning: ${KUP_TRUE_WARNING}`);
    if (preflight.killUserProcesses === 'unknown') log(`warning: ${KUP_UNKNOWN_WARNING}`);

    if (!preflight.ok) {
      error(preflight.refusalReason ?? 'install refused by preflight');
      return 1;
    }

    // 2. Binary distribution (copy on arch match, Releases asset otherwise).
    //    The prior-install sha256 is read FIRST so the decoy guard can tell
    //    a legitimate upgrade apart from a foreign file.
    const priorInstallSha256 = await records.readInstalledSha256();
    const provisioner = new HybridBinaryProvisioner(deps.runner, deps.transfer);
    const provision = await provisioner.provision({
      source: decideClientInstallSource(process.platform, process.arch, preflight.arch),
      version: deps.clientVersion,
      priorInstallSha256,
      ...(deps.provisionOverrides?.localBinaryPath !== undefined && {
        localBinaryPath: deps.provisionOverrides.localBinaryPath,
      }),
      ...(deps.provisionOverrides?.clientSha256 !== undefined && {
        clientSha256: deps.provisionOverrides.clientSha256,
      }),
    });
    log(`binary placed at ${provision.remotePath} (sha256 ${provision.sha256.slice(0, 12)}…)`);
    // Record the placement sha IMMEDIATELY: it is the prior-install witness
    // for the decoy guard on RETRY. Writing it only at the end left a window
    // where a failed later step (unit/linger/probe) stranded a Tako-placed
    // binary with no witness — and the retry refused it as a decoy (task 9.10
    // follow-up, real-world finding on homeserver).
    await records.writeInstalledSha256(provision.sha256);

    // 2b. Runnability probe: the placed binary must EXECUTE on the target.
    // A binary built on a newer distro than the server dies here with a GLIBC
    // error; abort NOW — before any unit/linger mutation — with a diagnosis
    // naming the missing version instead of a dead unit (task 9.11).
    const runProbe = await deps.runner.run(`'${provision.remotePath}' --version`);
    if (runProbe.exitCode !== 0) {
      const glibc = /GLIBC_[0-9.]+['`]? not found/.exec(runProbe.stderr)?.[0]?.replace(/['`]/g, '');
      throw new Error(
        `the placed agent binary does not run on the target` +
          (glibc !== undefined
            ? ` — ${glibc}: the server's glibc is older than the build machine's. Build Tako in an older-glibc environment (see docs/distribution.md) or upgrade the server, then retry`
            : ` — stderr: ${runProbe.stderr.trim().slice(0, 200) || `exit code ${runProbe.exitCode}`}`) +
          `. The binary stays in place for inspection; nothing else was modified`
      );
    }

    // 3. Unit + daemon-reload (fixed template; foreign units are refused).
    const controller = new SystemdRemoteController({ runner: deps.runner });
    await controller.writeUnitFile();
    await controller.daemonReload();

    // 4. Linger — enable only when the host did not already have it; record
    //    the by-tako marker so uninstall never has to guess (D8). If the
    //    marker write fails, COMPENSATE by disabling linger again: leaving
    //    enabled-but-unrecorded linger would make every future uninstall
    //    keep a linger Tako turned on (D8 fidelity over convenience).
    const linger = decideLingerOnInstall(preflight.linger);
    if (linger.action === 'enable-linger' && linger.lingerEnabledByTako) {
      await controller.enableLinger();
      try {
        await records.writeLingerByTako();
      } catch (markerError) {
        await controller.disableLinger();
        throw new Error(
          'linger was enabled but the by-tako marker could not be written — linger disabled again to restore the pre-install state',
          { cause: markerError }
        );
      }
      log('linger enabled by Tako');
    } else if (linger.action === 'enable-linger') {
      // 'unknown' pre-state: enable (the agent needs it) but do NOT record —
      // uninstall will keep linger rather than guess it was Tako's (D8).
      await controller.enableLinger();
      log('linger enabled (previous state unreadable — NOT recorded as Tako-enabled)');
    } else {
      log('linger already enabled — kept as-is (not recorded as Tako-enabled)');
    }

    // 5. Start the unit (the placement sha was already recorded in step 2,
    //    so any failure from here on leaves a retryable witness).
    await controller.enableUnit();
    log('tako-agent.service started');

    // 6. Mandatory survive-disconnect probe on connection B (never skipped).
    proberRan = true;
    const prober = new SurviveDisconnectProber({
      closeInstaller: deps.closeInstaller,
      openVerifier: deps.openVerifier,
      clientVersion: deps.clientVersion,
      ...(deps.proberOptions?.delays !== undefined && { delays: deps.proberOptions.delays }),
      ...(deps.proberOptions?.maxPollAttempts !== undefined && {
        maxPollAttempts: deps.proberOptions.maxPollAttempts,
      }),
      ...(deps.proberOptions?.sleep !== undefined && { sleep: deps.proberOptions.sleep }),
    });
    const probe = await prober.probe();
    if (!probe.ok) {
      error(`probe FAILED after ${probe.attempts} attempt(s): ${probe.reason}`);
      error('diagnostics from the verification connection:');
      error(probe.diagnostics);
      error('the install did NOT verify — the agent may not survive disconnects; nothing is reported as installed');
      return 1;
    }
    log(`probe passed on an independent connection (${probe.attempts} attempt(s)) — the agent survives disconnects`);
    return 0;
  } catch (flowError) {
    error(flowError instanceof Error ? flowError.message : String(flowError));
    return 1;
  } finally {
    // The prober owns the close on the probe path; every early exit still
    // fully closes the installing session.
    if (!proberRan) await deps.closeInstaller();
  }
}

/** Default entry: resolve the remote from conf and wire real SSH adapters. */
export async function runAgentInstallDefault(remoteName: string): Promise<number> {
  const resolved = await resolveRemote(remoteName);
  if (typeof resolved === 'number') return resolved;
  const { config } = resolved;
  const { SshConnectionManager } = await import('../../domains/remotes/infrastructure/SshConnectionManager.js');
  const { SshRemoteCommandRunner } = await import('../../domains/remotes/infrastructure/SshRemoteCommandRunner.js');
  const { SftpRemoteFileTransfer } = await import('../../domains/remotes/infrastructure/SftpRemoteFileTransfer.js');
  const { StreamLocalAgentChannel } = await import('../../domains/remotes/infrastructure/StreamLocalAgentChannel.js');

  const installer = new SshConnectionManager(config);
  const runner = new SshRemoteCommandRunner(installer);
  const transfer = new SftpRemoteFileTransfer(() => installer.sftp(), runner);
  const openVerifier = async (): Promise<VerifierConnection> => {
    const verifier = new SshConnectionManager(config);
    const verifierRunner = new SshRemoteCommandRunner(verifier);
    return {
      runner: verifierRunner,
      channel: new StreamLocalAgentChannel(verifier, verifierRunner),
      close: () => verifier.end(),
    };
  };

  return runAgentInstall({
    runner,
    transfer,
    closeInstaller: () => installer.end(),
    openVerifier,
    clientVersion: VERSION,
  });
}

export interface ResolvedRemoteConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth:
    { readonly type: 'password'; readonly password: string } | { readonly type: 'key'; readonly keyPath: string };
}

/** Resolve a configured remote into connection material (shared helper). */
export async function resolveRemote(remoteName: string): Promise<{ readonly config: ResolvedRemoteConfig } | number> {
  // conf store built by the remotes infrastructure factory (Port/Adapter
  // Isolation: this CLI handler never imports the `conf` package directly)
  const { createConfStore } = await import('../../domains/remotes/infrastructure/createConfStore.js');
  const confStore = createConfStore();
  const { ConfRemoteRepository } = await import('../../domains/remotes/infrastructure/ConfRemoteRepository.js');
  const { ConfSecretVault } = await import('../../domains/remotes/infrastructure/ConfSecretVault.js');
  const repo = new ConfRemoteRepository(confStore);
  const remote = await repo.getByName(remoteName);
  if (remote === null) {
    console.error(`unknown remote "${remoteName}" — add it first with "tako remote add"`);
    return 1;
  }
  if (remote.credentialType === 'interactive') {
    console.error(
      `remote "${remoteName}" uses interactive credentials — the agent CLI needs non-interactive access; re-add it with a stored password or key`
    );
    return 1;
  }
  if (remote.credentialType === 'ssh-key') {
    return {
      config: {
        host: remote.host,
        port: remote.port,
        username: remote.username,
        auth: { type: 'key', keyPath: remote.keyPath ?? '' },
      },
    };
  }
  const vault = new ConfSecretVault(confStore);
  return {
    config: {
      host: remote.host,
      port: remote.port,
      username: remote.username,
      auth: { type: 'password', password: vault.reveal(remote.obfuscatedPassword ?? '') },
    },
  };
}
