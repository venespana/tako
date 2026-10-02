// services/agent.ts — in-process API over the agent domain, client side
// (ADR-0019). The server side of the server/clients model for the agent:
// remote resolution + the unified auth decision, the SSH toolstack assembly
// (SshConnectionManager → SshRemoteCommandRunner → SftpRemoteFileTransfer →
// StreamLocalAgentChannel), the 9.17 socket probe, and the per-remote
// reconcile cursor are written ONCE here as private wiring. The TUI and the
// CLI both call these functions; neither composes the adapters anymore, and
// the public surface carries zero infrastructure types.
//
// Session material rule: a caller hands the session password IN (the TUI
// captured it at remote activation; the CLI read it from TAKO_SSH_PASSWORD).
// The service never reads the environment itself.
import { join } from 'node:path';

import { resolveRemoteAuth, type AgentConnectionAuth, type Remote } from './remotes.js';
import type { AgentHandshake, AgentSession, AgentTransport } from '../domains/agent/application/AgentTransport.js';
import { uninstallLingerGuard } from '../domains/agent/application/use-cases/UninstallAgent.js';
import type { AgentStatusResult } from '../domains/agent/domain/protocol.js';
import { runAgentInstall } from '../domains/agent/infrastructure/AgentInstallPipeline.js';
import { RemoteInstallRecords } from '../domains/agent/infrastructure/AgentInstallRecords.js';
import { StreamLocalAgentTransport } from '../domains/agent/infrastructure/StreamLocalAgentTransport.js';
import type { VerifierConnection } from '../domains/agent/infrastructure/SurviveDisconnectProber.js';
import { SystemdRemoteController } from '../domains/agent/infrastructure/SystemdRemoteController.js';
import type { AgentChannel } from '../domains/remotes/application/AgentChannel.js';
import { DEFAULT_AGENT_SOCKET_PATH } from '../domains/remotes/application/AgentChannel.js';
import type { RemoteCommandRunner } from '../domains/remotes/application/RemoteCommandRunner.js';
import { createConfStore } from '../domains/remotes/infrastructure/createConfStore.js';
import { SftpRemoteFileTransfer } from '../domains/remotes/infrastructure/SftpRemoteFileTransfer.js';
import { SshConnectionManager } from '../domains/remotes/infrastructure/SshConnectionManager.js';
import type { SshConnectConfig } from '../domains/remotes/infrastructure/SshConnectionManager.js';
import { SshRemoteCommandRunner } from '../domains/remotes/infrastructure/SshRemoteCommandRunner.js';
import { StreamLocalAgentChannel } from '../domains/remotes/infrastructure/StreamLocalAgentChannel.js';
import { VERSION } from '../shared/lib/version.js';

// ---------------------------------------------------------------------------
// Contract types re-exported for the frontends (they stop importing domains)
// ---------------------------------------------------------------------------

export type { AgentHandshake, AgentSession, AgentTransport } from '../domains/agent/application/AgentTransport.js';
export type {
  AgentFrame,
  AgentEventType,
  AgentRequestMap,
  AgentRequestType,
  AgentStatusResult,
  HelloAckPayload,
  HelloPayload,
  ProtocolErrorCode,
  ProtocolWarningPayload,
  JobStateChangedPayload,
  RunCompletedPayload,
} from '../domains/agent/domain/protocol.js';
export type {
  AgentLifecycle,
  JobDefinition,
  JobView,
  PruneScopes,
  RunMode,
  RunStatus,
  RunView,
  Schedule,
  Slug,
  StackLifecycleOp,
  TerminalRunStatus,
} from '../domains/agent/domain/types.js';
export { SLUG_PATTERN } from '../domains/agent/domain/types.js';
export { isValidStackDir } from '../domains/agent/domain/job.js';
export { isValidCronExpr } from '../domains/agent/domain/schedule.js';
export type { AgentConnectionAuth, Remote, RemoteAuthDecision } from './remotes.js';
export { decideRemoteAuth } from './remotes.js';

// ---------------------------------------------------------------------------
// 9.17 connect guard (moved from pages/tasks — a server-side rule now)
// ---------------------------------------------------------------------------

/** Thrown when the agent socket does not exist on the remote (9.17). */
export class AgentNotInstalledError extends Error {
  constructor(remote: string) {
    super(`agent not installed on ${remote} — the install panel will set it up`);
    this.name = 'AgentNotInstalledError';
  }
}

/** Absolute remote socket path (`~/.tako/agent.sock` with the tilde resolved). */
export function resolveAgentSocketPath(home: string): string {
  return join(home, DEFAULT_AGENT_SOCKET_PATH.slice(1));
}

/**
 * Probe the agent socket over exec and throw `AgentNotInstalledError` when
 * it is absent. The home is resolved the same way the transport's channel
 * resolves it (exec `printf %s "$HOME"` — no tilde assumptions).
 */
export async function assertAgentSocketPresent(runner: RemoteCommandRunner, remote: string): Promise<void> {
  const homeProbe = await runner.run('printf %s "$HOME"');
  const home = homeProbe.stdout.trim();
  if (homeProbe.exitCode !== 0 || home === '') {
    throw new Error('cannot resolve the remote home directory for the agent socket probe');
  }
  const probe = await runner.run(`test -S '${resolveAgentSocketPath(home)}'`);
  if (probe.exitCode !== 0) {
    throw new AgentNotInstalledError(remote);
  }
}

// ---------------------------------------------------------------------------
// Private wiring — the SSH toolstack, written once (ADR-0019 §2)
// ---------------------------------------------------------------------------

/** One live SSH stack: authenticated connection + exec runner + agent channel. */
interface SshToolstack {
  readonly manager: SshConnectionManager;
  readonly runner: SshRemoteCommandRunner;
  readonly channel: StreamLocalAgentChannel;
}

function openSshToolstack(config: SshConnectConfig): SshToolstack {
  const manager = new SshConnectionManager(config);
  const runner = new SshRemoteCommandRunner(manager);
  return { manager, runner, channel: new StreamLocalAgentChannel(manager, runner) };
}

/** Connection material from a resolved remote (the service auth shape is structurally the adapter's). */
function toConnectConfig(remote: Remote, auth: AgentConnectionAuth): SshConnectConfig {
  return { host: remote.host, port: remote.port, username: remote.username, auth };
}

/**
 * Fresh, INDEPENDENT verification connection (connection B) for the install
 * pipeline's survive-disconnect probe: own manager, own runner, own channel.
 */
function openInstallVerifier(config: SshConnectConfig): () => Promise<VerifierConnection> {
  return async () => {
    const verifier = new SshConnectionManager(config);
    const verifierRunner = new SshRemoteCommandRunner(verifier);
    return {
      runner: verifierRunner,
      channel: new StreamLocalAgentChannel(verifier, verifierRunner),
      close: () => verifier.end(),
    };
  };
}

// ---------------------------------------------------------------------------
// Requests + outcomes (minimal parameters in, typed results out)
// ---------------------------------------------------------------------------

/** Identifies the remote and the session material for one client operation. */
export interface AgentOperationRequest {
  /** Configured remote name (resolved FRESH per call — credentials may change mid-session). */
  readonly remote: string;
  /** Session password for interactive-credential remotes (never env, never argv). */
  readonly sessionPassword?: string;
}

export type AgentConnectResult =
  | { readonly kind: 'connected'; readonly session: AgentSession }
  | { readonly kind: 'refused'; readonly reason: string };

export type AgentInstallResult =
  | { readonly kind: 'installed' }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'failed'; readonly error: string };

export type AgentUninstallResult =
  { readonly kind: 'uninstalled'; readonly exitCode: number } | { readonly kind: 'refused'; readonly reason: string };

export type AgentStatusOutcome =
  | { readonly kind: 'ok'; readonly handshake: AgentHandshake; readonly status: AgentStatusResult }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'unreachable'; readonly detail: string }
  | { readonly kind: 'failed'; readonly detail: string };

/**
 * Open a new agent session for the active remote: resolve the remote fresh,
 * decide the auth ONCE, assemble the SSH stack, run the 9.17 socket probe
 * (a missing socket is the EXPECTED pre-install state and surfaces as the
 * typed `AgentNotInstalledError` — real transport failures keep their own
 * messages), then hand back the handshake-complete session.
 *
 * Expected outcomes (unknown remote, refused credentials) arrive as the
 * refusal object; transport-level failures THROW (the client renders them).
 */
export async function connectAgentSession(request: AgentOperationRequest): Promise<AgentConnectResult> {
  const resolution = await resolveRemoteAuth(request.remote, request.sessionPassword);
  if (resolution.kind !== 'resolved') {
    return { kind: 'refused', reason: resolution.reason };
  }
  const stack = openSshToolstack(toConnectConfig(resolution.remote, resolution.auth));
  try {
    await assertAgentSocketPresent(stack.runner, request.remote);
  } catch (error) {
    await stack.manager.end();
    throw error;
  }
  const transport = new StreamLocalAgentTransport({ channel: stack.channel, clientVersion: VERSION });
  const session = await transport.connect();
  return { kind: 'connected', session };
}

/**
 * Run the agent install IN-PROCESS over a fresh SSH stack (9.19): the shared
 * pipeline (InstallAgent preflight → HybridBinaryProvisioner →
 * SystemdRemoteController → SurviveDisconnectProber) with the SAME order,
 * connection shapes, and output lines for both clients. Progress lines
 * stream through `onLine` when given (TUI); without one they print to the
 * console (CLI). Resolves when the attempt settles — it never throws.
 */
export async function installAgent(
  request: AgentOperationRequest & { readonly onLine?: (line: string) => void }
): Promise<AgentInstallResult> {
  const resolution = await resolveRemoteAuth(request.remote, request.sessionPassword);
  if (resolution.kind !== 'resolved') {
    return { kind: 'refused', reason: resolution.reason };
  }
  const config = toConnectConfig(resolution.remote, resolution.auth);
  const installer = new SshConnectionManager(config);
  const runner = new SshRemoteCommandRunner(installer);
  const transfer = new SftpRemoteFileTransfer(() => installer.sftp(), runner);
  const openVerifier = openInstallVerifier(config);

  let failure: string | undefined;
  const onLine = request.onLine;
  const exitCode = await runAgentInstall({
    runner,
    transfer,
    closeInstaller: () => installer.end(),
    openVerifier,
    clientVersion: VERSION,
    log: onLine ?? (line => console.log(line)),
    error: line => {
      failure = line;
      if (onLine === undefined) console.error(line);
      else onLine(line);
    },
  });
  return exitCode === 0
    ? { kind: 'installed' }
    : { kind: 'failed', error: failure ?? `installer exited with code ${exitCode}` };
}

/**
 * Uninstall the agent from a remote in the EXACT design order (see
 * runAgentUninstall below). The outcome carries the flow's exit code; the
 * flow's progress and error lines print to the console unless redirected.
 */
export async function uninstallAgent(
  request: AgentOperationRequest & {
    readonly log?: (line: string) => void;
    readonly error?: (line: string) => void;
  }
): Promise<AgentUninstallResult> {
  const resolution = await resolveRemoteAuth(request.remote, request.sessionPassword);
  if (resolution.kind !== 'resolved') {
    return { kind: 'refused', reason: resolution.reason };
  }
  const config = toConnectConfig(resolution.remote, resolution.auth);
  const teardown = new SshConnectionManager(config);
  const runner = new SshRemoteCommandRunner(teardown);
  // Historical wiring, preserved verbatim: the verifier's channel binds the
  // TEARDOWN connection's runner (the residue checks only use the verifier's
  // runner, so the channel binding is inert — kept for behavior parity).
  const openVerifier = async (): Promise<VerifierConnection> => {
    const verifier = new SshConnectionManager(config);
    return {
      runner: new SshRemoteCommandRunner(verifier),
      channel: new StreamLocalAgentChannel(verifier, runner),
      close: () => verifier.end(),
    };
  };

  const exitCode = await runAgentUninstall({
    runner,
    channel: new StreamLocalAgentChannel(teardown, runner),
    clientVersion: VERSION,
    openVerifier,
    ...(request.log !== undefined && { log: request.log }),
    ...(request.error !== undefined && { error: request.error }),
  });
  return { kind: 'uninstalled', exitCode };
}

/**
 * One-shot agent status probe: connect → agent.status → close. A missing
 * socket or a dead daemon surfaces as `unreachable` (the channel-open
 * failure detail rides along) — status does NOT run the install probe.
 */
export async function fetchAgentStatus(request: AgentOperationRequest): Promise<AgentStatusOutcome> {
  const resolution = await resolveRemoteAuth(request.remote, request.sessionPassword);
  if (resolution.kind !== 'resolved') {
    return { kind: 'refused', reason: resolution.reason };
  }
  const stack = openSshToolstack(toConnectConfig(resolution.remote, resolution.auth));
  const transport = new StreamLocalAgentTransport({ channel: stack.channel, clientVersion: VERSION });
  return runAgentStatus({ transport });
}

// ---------------------------------------------------------------------------
// Status query over a transport (ports in — exported for tests)
// ---------------------------------------------------------------------------

export interface AgentStatusDeps {
  readonly transport: AgentTransport;
}

/** One agent session: connect → agent.status → close, as a typed outcome. */
export async function runAgentStatus(deps: AgentStatusDeps): Promise<AgentStatusOutcome> {
  let session: AgentSession;
  try {
    session = await deps.transport.connect();
  } catch (connectError) {
    return {
      kind: 'unreachable',
      detail: connectError instanceof Error ? connectError.message : String(connectError),
    };
  }

  try {
    const status = await session.request('agent.status', {});
    return { kind: 'ok', handshake: session.handshake, status };
  } catch (requestError) {
    return {
      kind: 'failed',
      detail: requestError instanceof Error ? requestError.message : String(requestError),
    };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Uninstall flow (ports in — moved verbatim from the former CLI handler)
// ---------------------------------------------------------------------------

const UNIT_TEST_ABSENT = `test -e "$HOME/.config/systemd/user/tako-agent.service"`;
const AGENT_DIR_TEST_ABSENT = `test -e "$HOME/.tako"`;

export interface AgentUninstallDeps {
  /** Connection A: teardown commands. */
  readonly runner: RemoteCommandRunner;
  /** Connection A: streamLocal channel for the linger-by-tako read. */
  readonly channel: AgentChannel;
  readonly clientVersion: string;
  /** Fresh, INDEPENDENT connection for the residue verification. */
  readonly openVerifier: () => Promise<VerifierConnection>;
  readonly log?: (line: string) => void;
  readonly error?: (line: string) => void;
}

/**
 * Reverse of install in the EXACT design order (design §Probe Mechanics):
 * read linger-by-tako via the agent transport BEFORE any teardown →
 * `systemctl --user disable --now` → rm unit → daemon-reload → disable
 * linger IFF Tako enabled it → rm -rf ~/.tako → residue verify on a SECOND
 * connection. When the transport is unreachable, linger stays enabled and
 * the operator gets a warning (the only-by-tako rule is never guessed).
 */
export async function runAgentUninstall(deps: AgentUninstallDeps): Promise<number> {
  const log = deps.log ?? (line => console.log(line));
  const error = deps.error ?? (line => console.error(line));
  const controller = new SystemdRemoteController({ runner: deps.runner });
  const records = new RemoteInstallRecords(deps.runner);

  try {
    // Step 1 — read linger-by-tako over the agent transport (BEFORE teardown).
    const guard = await readLingerGuard(deps);
    if (guard.warning !== undefined) {
      error(`warning: ${guard.warning}`);
    }

    // Steps 2-4 — stop unit → remove unit → daemon-reload.
    await controller.disableUnit();
    log('unit stopped and disabled');
    await controller.removeUnitFile();
    await controller.daemonReload();
    log('unit file removed, systemd reloaded');

    // Step 5 — disable linger ONLY when Tako enabled it (D8).
    if (guard.disableLinger) {
      await controller.disableLinger();
      log('linger disabled (Tako enabled it)');
    } else {
      log('linger kept ENABLED (not recorded as Tako-enabled — only-by-tako rule)');
    }

    // Step 6 — remove the agent directory (binary, db, socket, records).
    const home = await records.home();
    const rmResult = await deps.runner.run(`rm -rf '${home}/.tako'`);
    if (rmResult.exitCode !== 0) {
      throw new Error(`could not remove ${home}/.tako: ${rmResult.stderr.trim() || `exit ${rmResult.exitCode}`}`);
    }

    // Step 7 — residue verification on an INDEPENDENT connection.
    return await verifyResidue(deps, guard.disableLinger, log, error);
  } catch (uninstallError) {
    error(uninstallError instanceof Error ? uninstallError.message : String(uninstallError));
    return 1;
  }
}

/** Step 1: connect → agent.status → close; unreachable → guard keeps linger. */
async function readLingerGuard(deps: AgentUninstallDeps) {
  try {
    const transport = new StreamLocalAgentTransport({ channel: deps.channel, clientVersion: deps.clientVersion });
    const session = await transport.connect();
    try {
      const status = await session.request('agent.status', {});
      return uninstallLingerGuard(status);
    } finally {
      await session.close();
    }
  } catch {
    return uninstallLingerGuard(undefined);
  }
}

/** Step 7: unit gone, ~/.tako gone, linger state as expected (second connection). */
async function verifyResidue(
  deps: AgentUninstallDeps,
  lingerWasDisabled: boolean,
  log: (line: string) => void,
  error: (line: string) => void
): Promise<number> {
  let verifier: VerifierConnection | undefined;
  try {
    verifier = await deps.openVerifier();
  } catch (openError) {
    error(
      `could not open the verification connection for residue checks: ${
        openError instanceof Error ? openError.message : String(openError)
      }`
    );
    return 1;
  }

  try {
    let residue = false;

    if ((await absentCheck(verifier.runner, UNIT_TEST_ABSENT)) === false) {
      log('residue: unit file still present');
      residue = true;
    }
    if ((await absentCheck(verifier.runner, AGENT_DIR_TEST_ABSENT)) === false) {
      log('residue: ~/.tako still present');
      residue = true;
    }

    if (lingerWasDisabled) {
      const lingerResult = await verifier.runner.run('loginctl show-user "$USER" --property=Linger');
      const lingerOff = lingerResult.exitCode === 0 && /^Linger=no$/m.test(lingerResult.stdout);
      if (!lingerOff) {
        log('residue: linger is still enabled after disable-linger');
        residue = true;
      }
    }

    if (residue) {
      error('uninstall finished WITH residue — inspect the server manually');
      return 1;
    }
    log('residue check on an independent connection: clean');
    return 0;
  } finally {
    await verifier.close();
  }
}

/** `test -e` wrapper: true when ABSENT (exit != 0); transport failure counts as residue. */
async function absentCheck(runner: RemoteCommandRunner, command: string): Promise<boolean> {
  try {
    const result = await runner.run(command);
    return result.exitCode !== 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reconcile cursor (per-remote, client-side, conf-backed)
// ---------------------------------------------------------------------------

/** conf section for the per-remote reconcile cursor (agent.db seq, client-side). */
const CURSOR_SECTION = 'agentTasks';

function cursorKey(remote: string): string {
  return `${CURSOR_SECTION}.lastSeq.${remote}`;
}

/** Persisted reconcile cursor for this remote (0 = full resync). */
export function loadReconcileCursor(remote: string): number {
  const value: unknown = createConfStore().get(cursorKey(remote));
  return typeof value === 'number' ? value : 0;
}

/** Persist the reconcile cursor after a reconcile/trigger/history advance. */
export function saveReconcileCursor(remote: string, seq: number): void {
  createConfStore().set(cursorKey(remote), seq);
}
