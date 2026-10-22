// cli/commands/agent-uninstall.ts — CLI endpoint for `tako agent uninstall <remote>` (task 6.4)
//
// ADR-0019: parse → call the service → print → exit code. The uninstall
// flow (linger-by-tako read → teardown order → only-by-tako linger rule →
// residue verify on a second connection) and all SSH wiring live in
// services/agent; this command maps the outcome to an exit code (0 clean,
// 1 refused/failed).
import { uninstallAgent } from '../../services/agent.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';

/** Default entry: uninstall the agent from the configured remote through the services layer. */
export async function runAgentUninstallDefault(remoteName: string): Promise<number> {
  const result = await uninstallAgent({ remote: remoteName, sessionPassword: process.env[SESSION_PASSWORD_ENV] });

  if (result.kind === 'refused') {
    console.error(result.reason);
    return 1;
  }

  // The flow already printed its progress and residue lines to the console.
  return result.exitCode;
}
