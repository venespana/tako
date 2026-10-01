// cli/commands/agent-status.ts — CLI handler for `tako agent status <remote>` (task 6.5)
//
// One text table over a single agent session: unit state, linger
// (+ whether Tako enabled it), agent/client version + protocol, job count,
// and the handshake result (a version/protocol mismatch renders as a
// warning line — the session itself never blocks, per spec).
import type { AgentHandshake, AgentTransport } from '../../domains/agent/application/AgentTransport.js';
import type { AgentStatusResult } from '../../domains/agent/domain/protocol.js';

export interface AgentStatusDeps {
  readonly transport: AgentTransport;
  readonly clientVersion: string;
  readonly log?: (line: string) => void;
  readonly error?: (line: string) => void;
}

/** Render the status table (pure — exported for tests). */
export function formatAgentStatus(handshake: AgentHandshake, status: AgentStatusResult, clientVersion: string): string {
  const lingerText = status.linger ? `enabled${status.lingerByTako ? ' (enabled by tako)' : ''}` : 'disabled';
  const handshakeText =
    handshake.warning !== undefined ? `warning: ${handshake.warning.detail}` : `ok (protocol v${status.protocol})`;
  const rows: Array<[string, string]> = [
    ['unit state', status.unitState],
    ['linger', lingerText],
    ['agent version', status.agentVersion],
    ['client version', clientVersion],
    ['protocol', `v${status.protocol}`],
    ['jobs', String(status.jobCount)],
    ['uptime', `${status.uptimeSec}s`],
    ['handshake', handshakeText],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `${label.padEnd(width)} : ${value}`).join('\n');
}

export async function runAgentStatus(deps: AgentStatusDeps): Promise<number> {
  const log = deps.log ?? (line => console.log(line));
  const error = deps.error ?? (line => console.error(line));

  let session;
  try {
    session = await deps.transport.connect();
  } catch (connectError) {
    error(`agent unreachable: ${connectError instanceof Error ? connectError.message : String(connectError)}`);
    return 1;
  }

  try {
    const status = await session.request('agent.status', {});
    log(formatAgentStatus(session.handshake, status, deps.clientVersion));
    return 0;
  } catch (requestError) {
    error(
      `agent status request failed: ${requestError instanceof Error ? requestError.message : String(requestError)}`
    );
    return 1;
  } finally {
    await session.close();
  }
}

/** Default entry: resolve the remote from conf and wire the real transport. */
export async function runAgentStatusDefault(remoteName: string): Promise<number> {
  const { resolveRemote } = await import('./agent-install.js');
  const resolved = await resolveRemote(remoteName);
  if (typeof resolved === 'number') return resolved;
  const { config } = resolved;
  const { SshConnectionManager } = await import('../../domains/remotes/infrastructure/SshConnectionManager.js');
  const { SshRemoteCommandRunner } = await import('../../domains/remotes/infrastructure/SshRemoteCommandRunner.js');
  const { StreamLocalAgentChannel } = await import('../../domains/remotes/infrastructure/StreamLocalAgentChannel.js');
  const { StreamLocalAgentTransport } = await import('../../domains/agent/infrastructure/StreamLocalAgentTransport.js');

  const manager = new SshConnectionManager(config);
  const runner = new SshRemoteCommandRunner(manager);
  const transport = new StreamLocalAgentTransport({
    channel: new StreamLocalAgentChannel(manager, runner),
    clientVersion: (await import('../../shared/lib/version.js')).VERSION,
  });

  return runAgentStatus({ transport, clientVersion: (await import('../../shared/lib/version.js')).VERSION });
}
