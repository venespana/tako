// services/docker.ts — in-process API over the docker domain (ADR-0019).
//
// Complete domain functions for stack lifecycle and prune: minimal request
// in, typed report out. The adapter choice stays PRIVATE wiring — and stays
// LAZY (dynamic import inside each function) so agent-mode paths that only
// run lifecycle jobs never load dockerode, and vice versa (ADR-0016
// discipline, now owned by the service instead of the CLI handler).
import { resolveRemoteAuth } from './remotes.js';
import type { AgentConnectionAuth } from './remotes.js';
import { GetStackStatus } from '../domains/docker/application/GetStackStatus.js';
import { RunPrune } from '../domains/docker/application/RunPrune.js';
import { RunStackLifecycle } from '../domains/docker/application/RunStackLifecycle.js';
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
export type { StackStatusEntry } from '../domains/docker/domain/stack-status.js';

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
