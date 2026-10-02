// pages/tasks/model/agent-socket-probe.ts — 9.17 connect guard.
//
// The agent transport needs the remote's ~/.tako/agent.sock to exist; when it
// does not, the agent is simply NOT INSTALLED (the expected pre-install
// state), and the raw channel failure ("(SSH) Channel open failure: open
// failed") says nothing useful. This guard probes the socket over exec FIRST
// and fails the connect with the typed friendly error the install panel
// consumes. Transport failures on the probe itself propagate unchanged —
// they are real connection problems, not an absent agent.
import { join } from 'node:path';

import { DEFAULT_AGENT_SOCKET_PATH } from '../../../../domains/remotes/application/AgentChannel.js';
import type { RemoteCommandRunner } from '../../../../domains/remotes/application/RemoteCommandRunner.js';

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
