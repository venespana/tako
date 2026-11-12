// RemoteComposeLogsAdapter.ts — StackLogStreamer port over SshChannelSource
// (T1-cli-logs).
//
// Runs the domain-built `docker compose -p <stack> logs` (-f when follow)
// on the target host and exposes the exec channel as a line-oriented async
// stream, exactly like RemoteDockerLogsAdapter does for `docker logs`: the
// channel stays OPEN for the handle's whole life (the CALLER stops it),
// BOTH remote sources are consumed (compose prefixes container stderr onto
// the command's stderr; Go apps log to stderr by default), and each source
// keeps its own StringDecoder + partial buffer with CRLF/lone-\r
// termination and the 8 KiB partial cap.
//
// The line machinery is deliberately local to this file: RemoteLogStream
// is module-private in RemoteDockerLogsAdapter.ts and that file is outside
// this change's authorized surface — the duplication is pinned by these
// tests mirroring the original adapter's suite, so any behavioral drift on
// either side fails here.
import { StringDecoder } from 'node:string_decoder';

import type { ClientChannel } from 'ssh2';

import type { SshChannelSource } from '../../remotes/infrastructure/SshConnectionManager.js';
import type { StackLogStreamHandle, StackLogStreamer } from '../application/StreamStackLogs.js';
import { composeLogsCommand } from '../domain/stack-logs.js';

/** Strip one trailing \r so \r\n endings do not leak into rendered lines. */
const withoutCarriageReturn = (line: string): string => (line.endsWith('\r') ? line.slice(0, -1) : line);

/** A partial longer than this flushes as a line: bounded memory (8 KiB ≫ any honest log line). */
const PARTIAL_CAP = 8192;

/** The refusal reason keeps only the LAST stderr this many characters: bounded
 * memory, and the tail is what compose error messages put their point in. */
const STDERR_TAIL_CAP = 2000;

/** First index of a line terminator (\n or a lone \r), or -1 when none. A
 * \r at the very END of the partial is not one YET: it may pair with the
 * next chunk's leading \n into a single CRLF terminator. */
const lineEndOf = (partial: string): number => {
  const lf = partial.indexOf('\n');
  const cr = partial.indexOf('\r');

  if (cr === partial.length - 1 && lf === -1) return -1;

  if (lf === -1) return cr;

  if (cr === -1) return lf;

  return Math.min(lf, cr);
};

// One source's decode state: a line never tears because chunks of one
// source arrive intact, and two sources never share a partial buffer.
interface LinePipe {
  readonly decoder: StringDecoder;
  partial: string;
}

/**
 * One live log stream over a single exec channel. Single-consumer, same
 * contract as the container path: `lines` supports exactly one active
 * async iterator; stop() closes the channel; `done` settles 'stopped' or
 * 'ended'. The remote command's exit status is OBSERVED, never guessed:
 * ssh2 emits 'exit' before 'close' on every exec channel, so once `done`
 * settles 'ended', `remoteExitCode` says what the remote command reported
 * (null = no exit event — the caller cannot attest success) and
 * `stderrTail` holds the last characters of remote stderr for the refusal
 * reason (R3: a failing remote command must never read as success).
 */
class ComposeLogStream implements StackLogStreamHandle {
  private readonly buffer: string[] = [];
  private waiters: Array<{ resolve: (line: string | null) => void; reject: (error: Error) => void }> = [];
  private readonly stdoutPipe: LinePipe = { decoder: new StringDecoder('utf8'), partial: '' };
  private readonly stderrPipe: LinePipe = { decoder: new StringDecoder('utf8'), partial: '' };
  private failure: Error | undefined;
  private closed = false;
  private stopped = false;
  private remoteExit: number | null = null;
  private stderrTailRecord = '';
  private settleDone!: (outcome: 'stopped' | 'ended') => void;
  readonly done: Promise<'stopped' | 'ended'>;
  readonly lines: AsyncIterable<string>;

  /** The remote command's exit code once `done` settled 'ended'
   * (null when no exit event arrived — success cannot be attested). */
  get remoteExitCode(): number | null {
    return this.remoteExit;
  }

  /** The last {@link STDERR_TAIL_CAP} characters of remote stderr (for refusal reasons). */
  get stderrTail(): string {
    return this.stderrTailRecord;
  }

  constructor(private readonly channel: ClientChannel) {
    this.done = new Promise(resolve => {
      this.settleDone = resolve;
    });
    this.lines = { [Symbol.asyncIterator]: () => this.iterate() };

    channel.on('data', (chunk: Buffer) => this.accept(chunk, this.stdoutPipe));
    channel.stderr?.on('data', (chunk: Buffer) => this.accept(chunk, this.stderrPipe, true));
    channel.on('exit', (code: number | null) => {
      this.remoteExit = typeof code === 'number' ? code : null;
    });
    channel.on('error', (error: Error) => this.fail(error));
    channel.on('close', () => this.finishRemoteClose());
  }

  async stop(): Promise<void> {
    if (this.stopped) return;

    this.stopped = true;
    this.channel.close();
    this.closeStream();
    this.settleDone('stopped');
  }

  private accept(chunk: Buffer, pipe: LinePipe, isStderr = false): void {
    const text = pipe.decoder.write(chunk);

    if (isStderr) this.stderrTailRecord = (this.stderrTailRecord + text).slice(-STDERR_TAIL_CAP);

    // A \r held from the previous chunk pairs with this chunk's leading
    // \n: one CRLF terminator, no phantom empty line.
    if (text.startsWith('\n') && pipe.partial.endsWith('\r')) {
      pipe.partial = pipe.partial.slice(0, -1);
    }

    pipe.partial += text.replaceAll('\r\n', '\n');

    let newlineAt = lineEndOf(pipe.partial);

    while (newlineAt !== -1) {
      this.emitLine(pipe.partial.slice(0, newlineAt));
      pipe.partial = pipe.partial.slice(newlineAt + 1);
      newlineAt = lineEndOf(pipe.partial);
    }

    if (pipe.partial.length > PARTIAL_CAP) {
      this.emitLine(withoutCarriageReturn(pipe.partial));
      pipe.partial = '';
    }
  }

  /** The remote side exited (compose ended or transport dropped). */
  private finishRemoteClose(): void {
    if (this.stopped) return;

    this.flushPipe(this.stdoutPipe);
    this.flushPipe(this.stderrPipe);
    this.closeStream();
    this.settleDone('ended');
  }

  private flushPipe(pipe: LinePipe): void {
    const remainder = pipe.partial + pipe.decoder.end();
    pipe.partial = '';

    if (remainder !== '') this.emitLine(withoutCarriageReturn(remainder));
  }

  /** A channel error: the iterator throws it; buffered lines drain first. */
  private fail(error: Error): void {
    if (this.closed) return;

    this.failure = error;
    this.closeStream();
    this.settleDone('ended');
  }

  /** End production: park-free future pulls see closed/failure. */
  private closeStream(): void {
    this.closed = true;

    const parked = this.waiters;
    this.waiters = [];
    parked.forEach(waiter => {
      if (this.failure !== undefined) waiter.reject(this.failure);
      else waiter.resolve(null);
    });
  }

  private emitLine(line: string): void {
    const parked = this.waiters;

    if (parked.length > 0) {
      this.waiters = [];
      parked[0]?.resolve(line);
      // Extra parked waiters would mean concurrent consumers — out of contract.
      return;
    }

    this.buffer.push(line);
  }

  private async *iterate(): AsyncGenerator<string> {
    while (true) {
      const buffered = this.buffer.shift();

      if (buffered !== undefined) {
        yield buffered;
        continue;
      }

      if (this.failure !== undefined) throw this.failure;

      if (this.closed) return;

      const line = await new Promise<string | null>((resolve, reject) => {
        this.waiters.push({ resolve, reject });
      });

      if (line === null) return;

      yield line;
    }
  }
}

/** The compose stack handle enriched with remote exit observability (R3):
 * the production handle ALWAYS reports what the remote command returned —
 * `remoteExitCode` (null = no exit event, success cannot be attested) and
 * `stderrTail` (last characters of remote stderr, for refusal reasons). */
export type ComposeLogStreamHandle = StackLogStreamHandle & {
  readonly remoteExitCode: number | null;
  readonly stderrTail: string;
};

/** Use case port implemented here — see application/StreamStackLogs.ts. */
export class RemoteComposeLogsAdapter implements StackLogStreamer {
  constructor(private readonly channels: SshChannelSource) {}

  async stream(request: { stack: string; follow: boolean }): Promise<ComposeLogStreamHandle> {
    const channel = await this.channels.exec(composeLogsCommand(request.stack, request.follow));

    return new ComposeLogStream(channel);
  }
}

export { composeLogsCommand };
