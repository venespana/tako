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
// order interleaves into one queue. Daemon errors (e.g. a vanished container)
// now surface as plain lines followed by the stream's natural end.
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

/** One source's decode state: a line never tears because chunks of one
 * source arrive intact, and two sources never share a partial buffer. */
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
    pipe.partial += pipe.decoder.write(chunk);

    let newlineAt = pipe.partial.indexOf('\n');

    while (newlineAt !== -1) {
      this.emitLine(withoutCarriageReturn(pipe.partial.slice(0, newlineAt)));
      pipe.partial = pipe.partial.slice(newlineAt + 1);
      newlineAt = pipe.partial.indexOf('\n');
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
