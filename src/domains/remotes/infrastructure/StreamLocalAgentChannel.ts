// StreamLocalAgentChannel.ts — INFRASTRUCTURE adapter (sole ssh2 consumer)
import { join } from 'node:path';
import { Duplex } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

import type { ClientChannel } from 'ssh2';

import type { SshChannelSource } from './SshConnectionManager.js';
import type { AgentChannel, AgentChannelOpenOptions } from '../application/AgentChannel.js';
import { DEFAULT_AGENT_SOCKET_PATH } from '../application/AgentChannel.js';
import type { RemoteCommandRunner } from '../application/RemoteCommandRunner.js';

export class StreamLocalAgentChannel implements AgentChannel {
  private readonly streams = new Set<FramedChannelStream>();

  constructor(
    private readonly channels: SshChannelSource,
    private readonly runner: RemoteCommandRunner
  ) {}

  async open(options: AgentChannelOpenOptions = {}): Promise<Duplex> {
    const socketPath = await this.resolveSocketPath(options.socketPath ?? DEFAULT_AGENT_SOCKET_PATH);
    const channel = await this.channels.streamLocal(socketPath);
    const stream = new FramedChannelStream(channel);
    this.streams.add(stream);
    stream.once('close', () => {
      this.streams.delete(stream);
    });
    return stream;
  }

  async close(): Promise<void> {
    for (const stream of this.streams) {
      stream.destroy();
    }
  }

  private async resolveSocketPath(socketPath: string): Promise<string> {
    // Expand only the current user's home (`~`, `~/...`). `~user/...` passes
    // through and fails on direct-streamlocal, which requires absolute paths.
    if (socketPath !== '~' && !socketPath.startsWith('~/')) {
      return socketPath;
    }
    const home = await this.remoteHome();
    return join(home, socketPath.slice(1));
  }

  private async remoteHome(): Promise<string> {
    const result = await this.runner.run('printf %s "$HOME"');
    const home = result.stdout.trim();
    if (result.exitCode !== 0 || home === '') {
      const detail = result.stderr.trim() || `exit code ${result.exitCode}`;
      throw new Error(`Cannot resolve remote home directory: ${detail}`);
    }
    return home;
  }
}

/**
 * Duplex in object mode: readable side emits one string per newline-delimited
 * frame from the channel; writable side accepts strings and appends the
 * delimiter before forwarding to the channel. Handles chunked utf8 input,
 * backpressure in both directions, and channel error/close propagation.
 */
class FramedChannelStream extends Duplex {
  private readonly decoder = new StringDecoder('utf8');
  private buffer = '';
  private pendingWriteCallback?: (error?: Error | null) => void;

  constructor(private readonly channel: ClientChannel) {
    super({ objectMode: true });
    channel.on('data', (chunk: Buffer) => this.ingest(chunk));
    channel.stderr?.resume();
    channel.on('close', () => this.handleChannelClose());
    channel.on('error', (err: Error) => this.destroy(err));
    this.on('close', () => this.closeChannel());
  }

  private ingest(chunk: Buffer): void {
    this.buffer += this.decoder.write(chunk);
    this.flushBufferedLines();
  }

  /**
   * Push every complete buffered frame while the consumer accepts them.
   * Backpressure pauses the channel, but complete frames already decoded stay
   * in `buffer`; `_read()` flushes them so a post-burst idle channel cannot
   * strand frames until the next inbound chunk arrives.
   */
  private flushBufferedLines(): void {
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!this.push(line)) {
        this.channel.pause();
        return;
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  override _read(): void {
    this.flushBufferedLines();
    if (!this.buffer.includes('\n') && this.channel.isPaused()) {
      this.channel.resume();
    }
  }

  override _write(frame: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (typeof frame !== 'string') {
      callback(new TypeError('AgentChannel frames must be strings (one newline-delimited JSON frame per write)'));
      return;
    }
    if (this.channel.write(frame + '\n')) {
      callback();
      return;
    }
    const onDrain = () => {
      this.channel.removeListener('drain', onDrain);
      if (this.pendingWriteCallback === callback) {
        this.pendingWriteCallback = undefined;
        callback();
      }
    };
    this.pendingWriteCallback = callback;
    this.channel.once('drain', onDrain);
  }

  override _final(callback: (error?: Error | null) => void): void {
    // Half-close: signal EOF to the remote and wait for the channel to close.
    this.channel.end();
    callback();
  }

  private handleChannelClose(): void {
    if (this.destroyed) {
      return;
    }
    const pending = this.pendingWriteCallback;
    this.pendingWriteCallback = undefined;
    pending?.(new Error('Agent channel closed before a written frame could drain'));
    const remainder = this.decoder.end() + this.buffer;
    this.buffer = '';
    if (remainder.length > 0) {
      this.push(remainder);
    }
    this.push(null);
  }

  private closeChannel(): void {
    this.channel.removeAllListeners('data');
    this.channel.removeAllListeners('close');
    this.channel.removeAllListeners('error');
    this.channel.close();
  }
}
