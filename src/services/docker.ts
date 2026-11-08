// services/docker.ts — in-process API over the docker domain (ADR-0019).
//
// Complete domain functions for stack lifecycle and prune: minimal request
// in, typed report out. The adapter choice stays PRIVATE wiring — and stays
// LAZY (dynamic import inside each function) so agent-mode paths that only
// run lifecycle jobs never load dockerode, and vice versa (ADR-0016
// discipline, now owned by the service instead of the CLI handler).
import { resolveRemoteAuth } from './remotes.js';
import type { AgentConnectionAuth } from './remotes.js';
import { GetContainers } from '../domains/docker/application/GetContainers.js';
import { GetStackStatus } from '../domains/docker/application/GetStackStatus.js';
import { RunContainerLifecycle } from '../domains/docker/application/RunContainerLifecycle.js';
import { RunPrune } from '../domains/docker/application/RunPrune.js';
import { RunStackLifecycle } from '../domains/docker/application/RunStackLifecycle.js';
import { StreamContainerLogs } from '../domains/docker/application/StreamContainerLogs.js';
import type { ContainerLogStreamHandle } from '../domains/docker/application/StreamContainerLogs.js';
import type { ContainerLifecycleOp } from '../domains/docker/domain/container-lifecycle.js';
import type { ContainerSnapshot } from '../domains/docker/domain/container-status.js';
import type { StackStatusEntry } from '../domains/docker/domain/stack-status.js';
import type {
  ExecutionMode,
  LifecycleOp,
  PruneReport,
  PruneScope,
  StackLifecycleReport,
} from '../domains/docker/domain/types.js';
import type { Remote } from '../domains/remotes/domain/types.js';
import type { SshConnectConfig } from '../domains/remotes/infrastructure/SshConnectionManager.js';

export type {
  ExecutionMode,
  LifecycleOp,
  PruneReport,
  PruneScope,
  StackLifecycleReport,
} from '../domains/docker/domain/types.js';
export type { ContainerLifecycleOp } from '../domains/docker/domain/container-lifecycle.js';
export type { ContainerSnapshot } from '../domains/docker/domain/container-status.js';
export type { StackStatusEntry } from '../domains/docker/domain/stack-status.js';
export type { ContainerLogStreamHandle } from '../domains/docker/application/StreamContainerLogs.js';

/** One compose stack lifecycle operation (validated in-domain before anything runs). */
export function runStackLifecycle(request: {
  readonly op: LifecycleOp;
  readonly stackDir: string;
  readonly mode: ExecutionMode;
}): Promise<StackLifecycleReport> {
  return (async () => {
    const { ComposeCliAdapter } = await import('../domains/docker/infrastructure/ComposeCliAdapter.js');
    return new RunStackLifecycle(new ComposeCliAdapter()).execute(request);
  })();
}

/** One scoped safe prune (the closed ADR-0008 scope union; never accepts forbidden scopes). */
export function runPrune(request: {
  readonly scopes: PruneScope[];
  readonly mode: ExecutionMode;
}): Promise<PruneReport> {
  return (async () => {
    const { DockerodePruneAdapter } = await import('../domains/docker/infrastructure/DockerodePruneAdapter.js');
    return new RunPrune(new DockerodePruneAdapter()).execute(request);
  })();
}

// ---------------------------------------------------------------------------
// Stack status over SSH (mvp-status-command S4)
// ---------------------------------------------------------------------------

/** Outcome of one status read (refusal-object style: expected outcomes never throw). */
export type GetStackStatusOutcome =
  | { readonly kind: 'ok'; readonly entries: readonly StackStatusEntry[] }
  | { readonly kind: 'unknown-remote'; readonly reason: string }
  | { readonly kind: 'refusal'; readonly reason: string };

/** Connection material from a resolved remote (same mapping as the agent service). */
function toConnectConfig(remote: Remote, auth: AgentConnectionAuth): SshConnectConfig {
  return { host: remote.host, port: remote.port, username: remote.username, auth };
}

/**
 * The compose stack status of one configured remote, over SSH (read-only).
 * Resolves the remote FRESH per call, wires the SSH stack privately and
 * LAZILY, and always ends the connection — on every outcome and even when
 * the use case throws unexpectedly.
 */
export async function getStackStatus(request: {
  readonly remote: string;
  readonly sessionPassword?: string;
}): Promise<GetStackStatusOutcome> {
  const resolution = await resolveRemoteAuth(request.remote, request.sessionPassword);

  if (resolution.kind === 'unknown-remote') return { kind: 'unknown-remote', reason: resolution.reason };

  if (resolution.kind === 'refusal') return { kind: 'refusal', reason: resolution.reason };

  const { RemoteComposeCliAdapter } = await import('../domains/docker/infrastructure/RemoteComposeCliAdapter.js');
  const { SshConnectionManager } = await import('../domains/remotes/infrastructure/SshConnectionManager.js');
  const { SshRemoteCommandRunner } = await import('../domains/remotes/infrastructure/SshRemoteCommandRunner.js');

  const manager = new SshConnectionManager(toConnectConfig(resolution.remote, resolution.auth));

  try {
    const adapter = new RemoteComposeCliAdapter(new SshRemoteCommandRunner(manager));

    return await new GetStackStatus(adapter).execute();
  } finally {
    await manager.end();
  }
}

// ---------------------------------------------------------------------------
// Container listing over SSH (tui-remote-home-screen iteration 2)
// ---------------------------------------------------------------------------

/** Outcome of one container read (refusal-object style: expected outcomes never throw). */
export type GetContainersOutcome =
  | { readonly kind: 'ok'; readonly containers: readonly ContainerSnapshot[] }
  | { readonly kind: 'unknown-remote'; readonly reason: string }
  | { readonly kind: 'refusal'; readonly reason: string };

/**
 * The docker container list (including stopped ones) of one configured
 * remote, over SSH (read-only). Same discipline as {@link getStackStatus}:
 * the remote resolves FRESH per call, the SSH wiring stays private and
 * LAZY, and the connection always ends — on every outcome and even when the
 * use case throws unexpectedly.
 */
export async function getContainers(request: {
  readonly remote: string;
  readonly sessionPassword?: string;
}): Promise<GetContainersOutcome> {
  const resolution = await resolveRemoteAuth(request.remote, request.sessionPassword);

  if (resolution.kind === 'unknown-remote') return { kind: 'unknown-remote', reason: resolution.reason };

  if (resolution.kind === 'refusal') return { kind: 'refusal', reason: resolution.reason };

  const { RemoteDockerPsAdapter } = await import('../domains/docker/infrastructure/RemoteDockerPsAdapter.js');
  const { SshConnectionManager } = await import('../domains/remotes/infrastructure/SshConnectionManager.js');
  const { SshRemoteCommandRunner } = await import('../domains/remotes/infrastructure/SshRemoteCommandRunner.js');

  const manager = new SshConnectionManager(toConnectConfig(resolution.remote, resolution.auth));

  try {
    const adapter = new RemoteDockerPsAdapter(new SshRemoteCommandRunner(manager));

    return await new GetContainers(adapter).execute();
  } finally {
    await manager.end();
  }
}

// ---------------------------------------------------------------------------
// Container lifecycle over SSH (tui-remote-home-screen iteration 3)
// ---------------------------------------------------------------------------

/** Outcome of one lifecycle run (refusal-object style: expected outcomes never throw). */
export type RunContainerLifecycleOutcome =
  | { readonly kind: 'ok' }
  | { readonly kind: 'unknown-remote'; readonly reason: string }
  | { readonly kind: 'refusal'; readonly reason: string };

/**
 * Start or restart one container on a configured remote, over SSH. Same
 * discipline as {@link getContainers}: the remote resolves FRESH per call,
 * the SSH wiring stays private and LAZY, and the connection always ends —
 * on every outcome and even when the use case throws unexpectedly. The op
 * and the container name are validated in-domain BEFORE any command string
 * is built (RunContainerLifecycle), so a hostile name never reaches the
 * remote shell.
 */
export async function runContainerLifecycle(request: {
  readonly remote: string;
  readonly sessionPassword?: string;
  readonly container: string;
  readonly op: ContainerLifecycleOp;
}): Promise<RunContainerLifecycleOutcome> {
  const resolution = await resolveRemoteAuth(request.remote, request.sessionPassword);

  if (resolution.kind === 'unknown-remote') return { kind: 'unknown-remote', reason: resolution.reason };

  if (resolution.kind === 'refusal') return { kind: 'refusal', reason: resolution.reason };

  const { RemoteDockerLifecycleAdapter } =
    await import('../domains/docker/infrastructure/RemoteDockerLifecycleAdapter.js');
  const { SshConnectionManager } = await import('../domains/remotes/infrastructure/SshConnectionManager.js');
  const { SshRemoteCommandRunner } = await import('../domains/remotes/infrastructure/SshRemoteCommandRunner.js');

  const manager = new SshConnectionManager(toConnectConfig(resolution.remote, resolution.auth));

  try {
    const adapter = new RemoteDockerLifecycleAdapter(new SshRemoteCommandRunner(manager));

    return await new RunContainerLifecycle(adapter).execute({ op: request.op, container: request.container });
  } finally {
    await manager.end();
  }
}

// ---------------------------------------------------------------------------
// Live container log streaming over SSH (tui-live-logs T1)
// ---------------------------------------------------------------------------

/** Outcome of one log-stream acquisition (refusal-object style: expected outcomes never throw). */
export type StreamContainerLogsOutcome =
  | { readonly kind: 'ok'; readonly stream: ContainerLogStreamHandle }
  | { readonly kind: 'unknown-remote'; readonly reason: string }
  | { readonly kind: 'refusal'; readonly reason: string };

/** Default `--tail` for a fresh stream: one screen of recent output. */
const DEFAULT_LOG_TAIL = 200;

/**
 * Handle wrapper that owns the CONNECTION lifecycle on top of the domain
 * handle: the domain handle ends only its channel, while this service owns
 * the manager it exec'd through. This is the deliberate deviation from the
 * one-shot reads' `finally { manager.end() }` — a live stream must outlive
 * this function call, so the connection closes exactly when the caller
 * stops the handle.
 */
class ManagedLogStream implements ContainerLogStreamHandle {
  constructor(
    private readonly inner: ContainerLogStreamHandle,
    private readonly connection: { end(): Promise<void> }
  ) {}

  get lines(): AsyncIterable<string> {
    return this.inner.lines;
  }

  get done(): Promise<'stopped' | 'ended'> {
    return this.inner.done;
  }

  async stop(): Promise<void> {
    try {
      await this.inner.stop();
    } catch {
      // NEVER rethrow — this is the single fix point for teardown failures.
      // The caller (the TUI hook's cleanup and its ended-path stop) only
      // wants the remote side GONE; a channel dying mid-stop must not turn
      // fire-and-forget cleanup (`void handle.stop()`) into an unhandled
      // rejection. The connection end below is the guarantee that matters.
    } finally {
      await this.connection.end();
    }
  }
}

/**
 * Follow one container's logs on a configured remote, over SSH. The remote
 * resolves FRESH per call and the SSH wiring stays private and LAZY, but —
 * unlike {@link getContainers} — the connection is deliberately NOT ended
 * here: the returned handle owns it, and `stop()` ends channel AND
 * connection (unmount therefore always cleans up both).
 */
export async function streamContainerLogs(request: {
  readonly remote: string;
  readonly sessionPassword?: string;
  readonly container: string;
  readonly tail?: number;
}): Promise<StreamContainerLogsOutcome> {
  const resolution = await resolveRemoteAuth(request.remote, request.sessionPassword);

  if (resolution.kind === 'unknown-remote') return { kind: 'unknown-remote', reason: resolution.reason };

  if (resolution.kind === 'refusal') return { kind: 'refusal', reason: resolution.reason };

  const { RemoteDockerLogsAdapter } = await import('../domains/docker/infrastructure/RemoteDockerLogsAdapter.js');
  const { SshConnectionManager } = await import('../domains/remotes/infrastructure/SshConnectionManager.js');

  const manager = new SshConnectionManager(toConnectConfig(resolution.remote, resolution.auth));
  const result = await new StreamContainerLogs(new RemoteDockerLogsAdapter(manager)).execute({
    container: request.container,
    tail: request.tail ?? DEFAULT_LOG_TAIL,
  });

  if (result.kind !== 'ok') {
    await manager.end();
    return result;
  }

  return { kind: 'ok', stream: new ManagedLogStream(result.stream, manager) };
}
