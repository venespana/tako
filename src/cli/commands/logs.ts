// logs.ts — CLI endpoint for `tako logs <stack> [--host X] [-f]` (T1-cli-logs)
//
// ADR-0019: parse → call the service → print → exit code. The SSH stream
// lives in services/docker; this command owns only plain-line output and
// the exit-code mapping (0 ok · 1 refusal/invalid · 2 unexpected), per the
// `docs/commands.md` conventions the status command follows. Lines go to
// stdout undecorated — no TTY styling, script-friendly.
//
// Two review-driven guarantees (candidate R3/R4): the remote command's
// exit status is observed — a non-zero remote exit is a refusal (1), never
// success — and every stdout write callback is awaited before returning,
// so `process.exit` in cli/index.ts can never truncate piped output.
import { streamStackLogs } from '../../services/docker.js';
import type { StackLogStreamHandle } from '../../services/docker.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';

/** Sinks the command talks to (injected so tests never touch a real console).
 * A sink MAY return a write-completion promise; it is always awaited (R4). */
export interface LogsIo {
  readonly log: (line: string) => void | Promise<void>;
  readonly error: (line: string) => void | Promise<void>;
}

/** `tako logs` flags (ADR-0020 shape). */
export interface LogsFlags {
  /** Configured remote name. REQUIRED for now — same rule as `tako status`. */
  readonly host?: string;
  /** `-f`: follow live until SIGINT (or the remote side ends). */
  readonly follow?: boolean;
}

/** Remote exit observability on the production handle (R3). The service
 * wrapper forwards the adapter's status whenever the inner handle reports
 * it: a number (0 ok / non-zero refusal) or null (no exit event — cannot
 * attest success → 2). Only a handle with NO exit observability at all
 * (none in production; bare test doubles) reads undefined → success. */
interface RemoteExitStatus {
  readonly remoteExitCode: number | null | undefined;
  readonly stderrTail: string | undefined;
}

const remoteExitCodeOf = (stream: StackLogStreamHandle): number | null | undefined =>
  'remoteExitCode' in stream ? (stream as unknown as RemoteExitStatus).remoteExitCode : undefined;

const remoteStderrTailOf = (stream: StackLogStreamHandle): string | undefined =>
  'stderrTail' in stream ? (stream as unknown as RemoteExitStatus).stderrTail : undefined;

/**
 * Drain one acquired stream to stdout: print every line as it arrives and
 * always stop the handle afterwards — at the service layer stop() ends
 * BOTH the remote channel and the SSH connection, so this is the single
 * teardown fix point. With follow, SIGINT stops the stream mid-flight and
 * the run still exits 0 (a deliberate Ctrl-C is not a failure). Returns
 * how the stream finished, so the caller can map a non-zero remote exit
 * to a refusal instead of masking it as success (R3).
 */
async function drainStream(stream: StackLogStreamHandle, io: LogsIo, follow: boolean): Promise<'stopped' | 'ended'> {
  const onSigint = (): void => {
    void stream.stop();
  };

  if (follow) process.on('SIGINT', onSigint);

  try {
    const iterator = stream.lines[Symbol.asyncIterator]();

    while (true) {
      const result = await iterator.next();

      if (result.done === true) break;

      await io.log(result.value);
    }
  } finally {
    if (follow) process.removeListener('SIGINT', onSigint);

    await stream.stop();
  }

  return await stream.done;
}

/**
 * Run `tako logs <stack> --host <remote>`: flags → service → print → exit
 * code. Never renders a view; expected outcomes print and map to codes.
 * Every write callback resolves before this returns (R4), so the caller's
 * process.exit flushes everything it printed.
 */
export async function runLogs(stack: string, flags: LogsFlags, io: LogsIo): Promise<number> {
  try {
    // Loud refusal first (ADR-0020 §3): a missing required host prints and
    // exits — it never silently falls back to a default that does not exist.
    if (flags.host === undefined || flags.host === '') {
      await io.error('tako logs: missing required --host <remote> (no default-remote fallback yet)');
      return 1;
    }

    const outcome = await streamStackLogs({
      remote: flags.host,
      stack,
      follow: flags.follow ?? false,
      sessionPassword: process.env[SESSION_PASSWORD_ENV],
    });

    if (outcome.kind !== 'ok') {
      await io.error(`tako logs: ${outcome.reason}`);
      return 1;
    }

    const streamOutcome = await drainStream(outcome.stream, io, flags.follow ?? false);

    // R3: the remote command's own exit status decides success. A non-zero
    // exit is a refusal (1) carrying the remote stderr; an 'ended' stream
    // with NO exit status cannot attest success (2). A deliberate Ctrl-C
    // ('stopped') is never a failure.
    if (streamOutcome === 'ended') {
      const exitCode = remoteExitCodeOf(outcome.stream);

      if (typeof exitCode === 'number' && exitCode !== 0) {
        const tail = remoteStderrTailOf(outcome.stream)?.trim();
        await io.error(`tako logs: remote docker compose exited with code ${exitCode}${tail ? `: ${tail}` : ''}`);
        return 1;
      }

      if (exitCode === null) {
        await io.error('tako logs: remote stream ended without reporting an exit status');
        return 2;
      }
    }

    return 0;
  } catch (err) {
    await io.error(String(err));
    return 2;
  }
}
