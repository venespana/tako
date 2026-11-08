// RemoteDockerLogsAdapter.ts — ContainerLogStreamer port over SshChannelSource
// (tui-live-logs T1).
//
// Runs `docker logs -f --tail N <'name'>` on the target host and exposes the
// exec channel as a line-oriented async stream. Unlike the collect-then-close
// command runners, the channel stays OPEN for the handle's whole life: the
// CALLER stops the stream (handle.stop() closes the channel), and the service
// layer ends the SSH connection at that same moment. BOTH remote streams are
// consumed: docker demultiplexes the container's stderr onto `docker logs`
// stderr, and Go apps (adguardhome among them) log to stderr by default —
// ignoring it would render an empty screen. Each source keeps its own
// StringDecoder + partial buffer (lines never tear across sources); arrival
// order interleaves into one queue. Line endings: \n, \r\n and a LONE \r all
// terminate (progressive `tail -f` redraws surface as they arrive; a \r\n
// pair straddling chunks stays one terminator), and an un-terminated
// partial flushes as a line past PARTIAL_CAP — bounded memory. Daemon
// errors (e.g. a vanished container) surface as plain lines followed by
// the stream's natural end.
import { StringDecoder } from 'node:string_decoder';

import type { ClientChannel } from 'ssh2';

import type { SshChannelSource } from '../../remotes/infrastructure/SshConnectionManager.js';
import type { ContainerLogStreamHandle, ContainerLogStreamer } from '../application/StreamContainerLogs.js';

/** The one remote command shape this adapter ever runs (read-only tail+follow). */
export const dockerLogsCommand = (container: string, tail: number): string =>
  `docker logs -f --tail ${tail} ${shellSingleQuote(container)}`;

/** POSIX single-quote: ' → '\'' — defense in depth; validated names have no quotes. */
function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Strip one trailing \r so \r\n endings do not leak into rendered lines. */
const withoutCarriageReturn = (line: string): string => (line.endsWith('\r') ? line.slice(0, -1) : line);

/** A partial longer than this flushes as a line: a source with no
 * terminators (or one pathological un-terminated line) cannot grow the
 * pipe's memory without limit — past the cap the partial becomes a line
 * and the tail continues fresh. 8 KiB ≫ any honest progress-redraw line. */
const PARTIAL_CAP = 8192;

/** First index of a line terminator (\n or a lone \r), or -1 when none. A
 * \r at the very END of the partial is not one YET: it may pair with the
 * next chunk's leading \n into a single CRLF terminator, so it is held
 * until the next chunk decides. */
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
 * One live log stream over a single exec channel. Single-consumer: `lines`
 * supports exactly one active async iterator (the TUI's consumption loop).
 * Complete lines received before stop()/close stay consumable; production
 * just ends.
 */
class RemoteLogStream implements ContainerLogStreamHandle {
  private readonly buffer: string[] = [];
  private waiters: Array<{ resolve: (line: string | null) => void; reject: (error: Error) => void }> = [];
  private readonly stdoutPipe: LinePipe = { decoder: new StringDecoder('utf8'), partial: '' };
  private readonly stderrPipe: LinePipe = { decoder: new StringDecoder('utf8'), partial: '' };
  private failure: Error | undefined;
  private closed = false;
  private stopped = false;
  // Assigned synchronously by the `done` executor below — the Promise
  // constructor runs the callback before this constructor returns. Not
  // `readonly`: TS only permits readonly assignment in the constructor's
  // direct scope, and this assignment lives in the executor callback.
  private settleDone!: (outcome: 'stopped' | 'ended') => void;
  readonly done: Promise<'stopped' | 'ended'>;
  readonly lines: AsyncIterable<string>;

  constructor(private readonly channel: ClientChannel) {
    this.done = new Promise(resolve => {
      this.settleDone = resolve;
    });
    this.lines = { [Symbol.asyncIterator]: () => this.iterate() };

    channel.on('data', (chunk: Buffer) => this.accept(chunk, this.stdoutPipe));
    channel.stderr?.on('data', (chunk: Buffer) => this.accept(chunk, this.stderrPipe));
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

  private accept(chunk: Buffer, pipe: LinePipe): void {
    const text = pipe.decoder.write(chunk);

    // A \r held from the previous chunk pairs with this chunk's leading
    // \n: drop it so a CRLF straddling the boundary stays ONE terminator
    // (the \n below ends the line exactly once — no phantom empty line).
    if (text.startsWith('\n') && pipe.partial.endsWith('\r')) {
      pipe.partial = pipe.partial.slice(0, -1);
    }

    // CRLF inside one chunk normalizes to \n; a LONE \r survives and
    // terminates its line below, so progressive `tail -f` redraws (progress
    // bars) surface as chunks arrive instead of buffering until close.
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

  /** The remote side exited (container stopped or transport dropped). */
  private finishRemoteClose(): void {
    if (this.stopped) return;

    // StringDecoder.end() flushes a split multibyte tail as U+FFFD — honest
    // output for truncated data, never a crash.
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

/** Use case port implemented here — see application/StreamContainerLogs.ts. */
export class RemoteDockerLogsAdapter implements ContainerLogStreamer {
  constructor(private readonly channels: SshChannelSource) {}

  async stream(request: { container: string; tail: number }): Promise<ContainerLogStreamHandle> {
    const channel = await this.channels.exec(dockerLogsCommand(request.container, request.tail));

    return new RemoteLogStream(channel);
  }
}
