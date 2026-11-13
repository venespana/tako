// infrastructure/AgentInstallPipeline.ts — the agent install flow over ports
// (tasks 6.3, 6.8, 9.10/9.11 follow-ups; shared by 9.19).
//
// preflight (InstallAgent) → hybrid binary distribution (HybridBinaryProvisioner)
// → systemd unit + linger (SystemdRemoteController) → mandatory
// survive-disconnect probe (SurviveDisconnectProber). Decisions live in the
// use cases; this pipeline composes the adapters over injected ports
// (RemoteCommandRunner / RemoteFileTransfer / connection callbacks) and maps
// outcomes to an exit code (0 ok, 1 refusal/failure). Consumers: the CLI
// handler (`tako agent install`) and the TUI tasks gateway's in-process
// install (9.19) — one pipeline, byte-identical order and semantics.
//
// Linger recording (design D8): when Tako enables linger here, the by-tako
// marker is written through RemoteInstallRecords so the agent's status()
// and any later uninstall trust a RECORDED flag instead of guessing.
import { RemoteInstallRecords } from './AgentInstallRecords.js';
import { HybridBinaryProvisioner } from './HybridBinaryProvisioner.js';
import { SurviveDisconnectProber, isUnitActive, type VerifierConnection } from './SurviveDisconnectProber.js';
import { SystemdRemoteController } from './SystemdRemoteController.js';
import type { RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import type { RemoteFileTransfer } from '../../remotes/application/RemoteFileTransfer.js';
import {
  InstallAgent,
  UnsupportedArchitectureError,
  decideClientInstallSource,
  decideLingerOnInstall,
  type InstallPreflight,
} from '../application/use-cases/InstallAgent.js';

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
    /** Test seam: pretend the installing client runs on this platform (e.g.
     * 'darwin' on a linux/arm64 runner) so the arch-mismatch → Releases
     * download path can be exercised natively (RA-003). */
    readonly clientPlatform?: string;
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
    let provision = await provisioner.provision({
      source: decideClientInstallSource(
        deps.provisionOverrides?.clientPlatform ?? process.platform,
        process.arch,
        preflight.arch
      ),
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
    // error (9.11). Since 9.12 that is no longer fatal on its own: the
    // per-arch Releases asset (built on debian:bookworm, low glibc floor) is
    // downloaded through the SAME path the arch-mismatch fallback uses, and
    // the probe re-runs on the downloaded binary. Only when BOTH paths fail
    // does the install abort — naming the arch and both attempted paths —
    // still BEFORE any unit/linger mutation.
    const probeRunnability = async (): Promise<string> => {
      const runProbe = await deps.runner.run(`'${provision.remotePath}' --version`);

      if (runProbe.exitCode === 0) return '';

      const glibc = /GLIBC_[0-9.]+['`]? not found/.exec(runProbe.stderr)?.[0]?.replace(/['`]/g, '');
      return glibc !== undefined
        ? `${glibc}: the server's glibc is older than the build machine's. Build Tako in an older-glibc environment (see docs/distribution.md) or upgrade the server`
        : `stderr: ${runProbe.stderr.trim().slice(0, 200) || `exit code ${runProbe.exitCode}`}`;
    };

    const copyPathFailure = await probeRunnability();

    if (copyPathFailure !== '') {
      const asset = preflight.arch === 'arm64' ? 'tako-linux-arm64' : 'tako-linux-x64';
      log(`the placed binary does not run on the target — attempting the Releases fallback (${asset})`);
      let downloadFailure: string | undefined;

      try {
        provision = await provisioner.provision({
          source: { kind: 'download-release-asset', asset },
          version: deps.clientVersion,
          // Re-read the record: it now names the binary we JUST placed, so
          // the decoy guard sees a known prior install and allows the
          // replacement (a stale value would refuse it as a decoy).
          priorInstallSha256: await records.readInstalledSha256(),
        });
        await records.writeInstalledSha256(provision.sha256);
        log(`fallback binary placed at ${provision.remotePath} (sha256 ${provision.sha256.slice(0, 12)}…)`);
        const reProbeFailure = await probeRunnability();

        if (reProbeFailure !== '') {
          downloadFailure = `the downloaded binary also failed the runnability probe — ${reProbeFailure}`;
        }
      } catch (fallbackError) {
        downloadFailure = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      }

      if (downloadFailure !== undefined) {
        throw new Error(
          `the agent binary does not run on the target (arch ${preflight.arch}) — both distribution paths failed. ` +
            `Copy path (uploaded client binary): ${copyPathFailure}. ` +
            `Releases fallback (${asset}): ${downloadFailure}. ` +
            `The binary stays in place for inspection; nothing else was modified`
        );
      }
    }

    // 3. Unit + daemon-reload (fixed template; foreign units are refused).
    //    9.13: remember whether the unit was ALREADY active — read AFTER the
    //    unit write (so the freshness of the file is settled) and BEFORE any
    //    start mutation, because `enable --now` no-ops on an active unit and
    //    would leave a stale process serving a deleted socket in place.
    const controller = new SystemdRemoteController({ runner: deps.runner });
    await controller.writeUnitFile();
    await controller.daemonReload();
    const unitWasActive = await isUnitActive(deps.runner);

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
    //    9.13: an ALREADY-ACTIVE unit gets try-restart (revives a stale unit
    //    serving a deleted socket); `enable --now` stays for the fresh case.
    if (unitWasActive) {
      await controller.tryRestartUnit();
      // Preserve boot-start: a unit that was running but manually started is
      // not enabled — try-restart alone would leave it dead after a reboot.
      await controller.enableUnitForBoot();
      log('tako-agent.service was already active — restarted to pick up the fresh binary and socket');
    } else {
      await controller.enableUnit();
      log('tako-agent.service started');
    }

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
