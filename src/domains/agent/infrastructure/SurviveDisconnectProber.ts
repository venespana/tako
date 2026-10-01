// infrastructure/SurviveDisconnectProber.ts — mandatory survive-disconnect probe (task 4.7)
//
// Design §Probe Mechanics: the installing session (connection A) is FULLY
// closed, then an INDEPENDENT second connection (B) verifies — up to 3× with
// 1 s between attempts after a 2 s settle wait — that (a) the unit is
// `active` per `systemctl --user is-active` and (b) a protocol handshake over
// a streamLocal channel on B answers hello_ack with the expected agent
// version. On failure the probe NEVER reports success: it collects
// diagnostics over B (unit status, journal tail, linger state,
// KillUserProcesses value) and returns them with the failure reason.
//
// The connections themselves are injected (composition root, WU6): the
// prober stays transport-agnostic and holds no ssh2 knowledge.
import { StreamLocalAgentTransport } from './StreamLocalAgentTransport.js';
import type { AgentChannel } from '../../remotes/application/AgentChannel.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';

/** One INDEPENDENT verification connection (never reused from the install). */
export interface VerifierConnection {
  readonly runner: RemoteCommandRunner;
  readonly channel: AgentChannel;
  close(): Promise<void>;
}

export interface SurviveDisconnectProberOptions {
  /** Fully close the installing session (connection A). */
  readonly closeInstaller: () => Promise<void>;
  /** Open a fresh, independent verification connection (connection B). */
  readonly openVerifier: () => Promise<VerifierConnection>;
  /** Expected agent version — the handshake must report exactly this. */
  readonly clientVersion: string;
  readonly socketPath?: string;
  /** Design defaults: settle 2 s, poll every 1 s, 3 attempts. */
  readonly delays?: { readonly afterCloseMs?: number; readonly pollIntervalMs?: number };
  readonly maxPollAttempts?: number;
  /** Injectable for tests; defaults to a real timer sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export type ProbeResult =
  | { readonly ok: true; readonly attempts: number }
  | { readonly ok: false; readonly attempts: number; readonly reason: string; readonly diagnostics: string };

const AFTER_CLOSE_MS = 2_000;
const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_ATTEMPTS = 3;
const DIAGNOSTIC_COMMANDS = [
  'systemctl --user status tako-agent.service --no-pager -l',
  // 9.13: the ~/.tako listing NAMES a missing agent.sock in the failure
  // report (the deleted-socket scenario fails the channel open, and without
  // the listing nothing in the diagnostics points at the socket).
  'ls -la "$HOME/.tako/"',
  'journalctl --user -u tako-agent.service -n 50 --no-pager',
  'loginctl show-user "$USER" --property=Linger',
  'busctl get-property org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager KillUserProcesses',
  'cat /etc/systemd/logind.conf',
] as const;

export class SurviveDisconnectProber {
  readonly #options: SurviveDisconnectProberOptions;

  constructor(options: SurviveDisconnectProberOptions) {
    this.#options = options;
  }

  async probe(): Promise<ProbeResult> {
    const afterCloseMs = this.#options.delays?.afterCloseMs ?? AFTER_CLOSE_MS;
    const pollIntervalMs = this.#options.delays?.pollIntervalMs ?? POLL_INTERVAL_MS;
    const maxAttempts = this.#options.maxPollAttempts ?? MAX_POLL_ATTEMPTS;
    const sleep = this.#options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));

    await this.#options.closeInstaller();
    await sleep(afterCloseMs);

    let lastReason = 'unknown failure';
    let connection: VerifierConnection | undefined;
    try {
      connection = await this.#options.openVerifier();

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const verdict = await this.#verifyOnce(connection);
        if (verdict === undefined) {
          return { ok: true, attempts: attempt };
        }
        lastReason = verdict;
        if (attempt < maxAttempts) {
          await sleep(pollIntervalMs);
        }
      }

      const diagnostics = await this.#collectDiagnostics(connection);
      return { ok: false, attempts: maxAttempts, reason: lastReason, diagnostics };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const diagnostics = connection
        ? await this.#collectDiagnostics(connection)
        : `verifier connection could not be established: ${detail}`;
      return { ok: false, attempts: 0, reason: `verifier connection failed: ${detail}`, diagnostics };
    } finally {
      await connection?.close();
    }
  }

  /** One poll: unit active AND handshake with the expected version. undefined = pass. */
  async #verifyOnce(connection: VerifierConnection): Promise<string | undefined> {
    const active = await isUnitActive(connection.runner);
    if (!active) {
      return 'unit is not active — the agent died with the installing session';
    }

    const transport = new StreamLocalAgentTransport({
      channel: connection.channel,
      clientVersion: this.#options.clientVersion,
      ...(this.#options.socketPath !== undefined && { socketPath: this.#options.socketPath }),
    });
    try {
      const session = await transport.connect();
      const versionMatches = session.handshake.ack.agentVersion === this.#options.clientVersion;
      const warning = session.handshake.warning;
      await session.close();
      if (!versionMatches) {
        return `handshake agentVersion mismatch (expected ${this.#options.clientVersion})`;
      }
      if (warning !== undefined) {
        return `handshake protocol warning: ${warning.detail}`;
      }
      return undefined;
    } catch (error) {
      return `handshake failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Failure path diagnostics over connection B — printed with the error by
   * the caller; success is NEVER reported past this point.
   */
  async #collectDiagnostics(connection: VerifierConnection): Promise<string> {
    const sections: string[] = [];
    for (const command of DIAGNOSTIC_COMMANDS) {
      try {
        const result = await connection.runner.run(command);
        const output = result.stdout.trim() || result.stderr.trim() || '(no output)';
        sections.push(`$ ${command}\n${output}`);
      } catch (error) {
        sections.push(`$ ${command}\n(transport failure: ${error instanceof Error ? error.message : String(error)})`);
      }
    }
    return sections.join('\n\n');
  }
}

/** `systemctl --user is-active` → exit 0 AND stdout `active` (task 6.9 semantics). */
export async function isUnitActive(runner: RemoteCommandRunner): Promise<boolean> {
  let result: RemoteCommandResult;
  try {
    result = await runner.run('systemctl --user is-active tako-agent.service');
  } catch {
    return false;
  }
  return result.exitCode === 0 && result.stdout.trim() === 'active';
}
