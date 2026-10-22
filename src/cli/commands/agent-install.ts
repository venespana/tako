// cli/commands/agent-install.ts — CLI endpoint for `tako agent install <remote>` (tasks 6.3, 6.8)
//
// ADR-0019: parse → call the service → print → exit code. The install flow
// (preflight → hybrid binary distribution → systemd unit + linger →
// mandatory survive-disconnect probe), the remote resolution, the unified
// auth decision, and the SSH toolstack wiring all live in services/agent —
// the same functions the TUI's in-process install calls, so both surfaces
// run byte-identical order and semantics. This command only reads the env
// session password, prints the outcome, and maps it to an exit code
// (0 installed, 1 refused/failed).
//
// Session password (task 9.18): for interactive-credential remotes this
// command reads the session password from the `TAKO_SSH_PASSWORD` environment
// variable for non-interactive terminal runs. Since 9.19 the TUI does not
// spawn this command anymore (it installs in-process and passes the session
// password as connection material directly); a bare terminal run without the
// env var is still refused, and the refusal names the remedy.
import { installAgent } from '../../services/agent.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';

/**
 * Default entry: install the agent on the configured remote through the
 * services layer. Interactive-credential remotes authenticate with
 * `TAKO_SSH_PASSWORD` from the environment for this run only (never argv,
 * never logged).
 */
export async function runAgentInstallDefault(remoteName: string): Promise<number> {
  const result = await installAgent({ remote: remoteName, sessionPassword: process.env[SESSION_PASSWORD_ENV] });

  switch (result.kind) {
    case 'refused':
      console.error(result.reason);
      return 1;
    case 'failed':
      // The pipeline already streamed the progress and error lines to the
      // console; the exit code carries the outcome.
      return 1;
    case 'installed':
      return 0;
  }
}
