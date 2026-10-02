// cli/commands/agent-status.ts — CLI endpoint for `tako agent status <remote>` (task 6.5)
//
// ADR-0019: parse → call the service → print → exit code. The session query
// (connect → agent.status → close) lives in services/agent; this command owns
// only the text table and the exit-code mapping (0 ok, 1 refused/unreachable/
// failed).
import { fetchAgentStatus } from '../../services/agent.js';
import type { AgentHandshake, AgentStatusResult } from '../../services/agent.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';
import { VERSION } from '../../shared/lib/version.js';

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

/** Default entry: resolve the remote through the services layer and print the table. */
export async function runAgentStatusDefault(remoteName: string): Promise<number> {
  const outcome = await fetchAgentStatus({ remote: remoteName, sessionPassword: process.env[SESSION_PASSWORD_ENV] });
  switch (outcome.kind) {
    case 'refused':
      console.error(outcome.reason);
      return 1;
    case 'unreachable':
      console.error(`agent unreachable: ${outcome.detail}`);
      return 1;
    case 'failed':
      console.error(`agent status request failed: ${outcome.detail}`);
      return 1;
    case 'ok':
      console.log(formatAgentStatus(outcome.handshake, outcome.status, VERSION));
      return 0;
  }
}
