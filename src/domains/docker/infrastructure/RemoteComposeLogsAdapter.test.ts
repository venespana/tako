// RemoteComposeLogsAdapter.test.ts — StackLogStreamer over SshChannelSource
// (T1-cli-logs). The adapter is a translation layer: ONE fixed remote
// command shape (compose -p + single-quoted stack, -f only when follow),
// StringDecoder line integrity across chunk boundaries, and the handle
// contract — channel error → the iterator throws, channel close → done
// 'ended', stop() → channel close and done 'stopped'. Nothing here opens
// SSH; the channel source is injected.
import { EventEmitter } from 'node:events';

import type { ClientChannel } from 'ssh2';
import { describe, expect, it, vi } from 'vitest';

import { composeLogsCommand, RemoteComposeLogsAdapter } from './RemoteComposeLogsAdapter.js';
import type { SshChannelSource } from '../../remotes/infrastructure/SshConnectionManager.js';

interface FakeChannel extends EventEmitter {
  close: ReturnType<typeof vi.fn>;
  stderr: EventEmitter;
}

function createFakeChannel(): FakeChannel {
  const channel = new EventEmitter() as FakeChannel;

  channel.close = vi.fn();
  channel.stderr = new EventEmitter();

  return channel;
}

function sourceServing(channel: FakeChannel): { exec: ReturnType<typeof vi.fn>; source: SshChannelSource } {
  const exec = vi.fn(async () => channel as unknown as ClientChannel);

  return { exec, source: { exec, sftp: vi.fn(), streamLocal: vi.fn() } as unknown as SshChannelSource };
}

/** Drains the iterable into `sink` (default fresh): throws through channel
 * errors, so a rejection leaves whatever arrived before the failure in the
 * sink. Manual iterator protocol: the repo bans for-of statements. */
async function collect(lines: AsyncIterable<string>, sink: string[] = []): Promise<string[]> {
  const iterator = lines[Symbol.asyncIterator]();

  while (true) {
    const result = await iterator.next();

    if (result.done === true) return sink;

    sink.push(result.value);
  }
}

describe('RemoteComposeLogsAdapter — command discipline', () => {
  it('runs the compose logs command for the stack without -f when not following', async () => {
    const channel = createFakeChannel();
    const { exec, source } = sourceServing(channel);

    await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(`docker compose -p 'media' logs`);
  });

  it('appends -f exactly when follow is requested', async () => {
    const channel = createFakeChannel();
    const { exec, source } = sourceServing(channel);

    await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: true });

    expect(exec).toHaveBeenCalledWith(`docker compose -p 'media' logs -f`);
  });

  it('delegates the command shape to the domain builder (single builder, single truth)', () => {
    expect(composeLogsCommand('media', true)).toBe(`docker compose -p 'media' logs -f`);
  });
});

describe('RemoteComposeLogsAdapter — line integrity', () => {
  it('reassembles lines split across chunks (StringDecoder discipline)', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    channel.emit('data', Buffer.from('he', 'utf8'));
    channel.emit('data', Buffer.from('llo wo', 'utf8'));
    channel.emit('data', Buffer.from('rld\n', 'utf8'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['hello world']);
  });

  it('keeps multibyte characters intact when a chunk splits one', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    const full = Buffer.from('wèb\n', 'utf8');
    channel.emit('data', full.subarray(0, 2));
    channel.emit('data', full.subarray(2));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['wèb']);
  });

  it('splits multiple lines per chunk and strips \r from \r\n endings', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    channel.emit('data', Buffer.from('one\ntwo\r\nthree\r\n', 'utf8'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['one', 'two', 'three']);
  });

  it('flushes a trailing partial line when the channel closes', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    channel.emit('data', Buffer.from('a\npartial-without-newline', 'utf8'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['a', 'partial-without-newline']);
  });
});

describe('RemoteComposeLogsAdapter — stderr is part of the log stream', () => {
  it('surfaces stderr lines (containers logging to stderr would otherwise show nothing)', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    channel.emit('data', Buffer.from('stdout line\n', 'utf8'));
    channel.stderr.emit('data', Buffer.from('stderr line\n', 'utf8'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['stdout line', 'stderr line']);
  });

  it('keeps stderr line integrity across split chunks', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    const full = Buffer.from('èrror\n', 'utf8');
    channel.stderr.emit('data', full.subarray(0, 2));
    channel.stderr.emit('data', full.subarray(2));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['èrror']);
  });
});

describe('RemoteComposeLogsAdapter — handle contract', () => {
  it('channel close ends the iterator and resolves done as ended', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual([]);
    await expect(handle.done).resolves.toBe('ended');
    expect(channel.close).not.toHaveBeenCalled();
  });

  it('channel error makes the iterator throw the transport failure', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    channel.emit('error', new Error('channel blew up'));

    await expect(collect(handle.lines)).rejects.toThrow('channel blew up');
  });

  it('stop() closes the channel exactly once and resolves done as stopped', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: true });

    await handle.stop();
    await handle.stop();

    expect(channel.close).toHaveBeenCalledTimes(1);
    await expect(handle.done).resolves.toBe('stopped');
    await expect(collect(handle.lines)).resolves.toEqual([]);
  });

  it('a close event racing after stop() never overrides the stopped outcome', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: true });

    await handle.stop();
    channel.emit('close');

    await expect(handle.done).resolves.toBe('stopped');
  });

  it('reports the remote exit code and a bounded stderr tail when the command fails (R3)', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    channel.stderr.emit('data', Buffer.from('no configuration file found: media\n', 'utf8'));
    channel.emit('exit', 1);
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['no configuration file found: media']);
    await expect(handle.done).resolves.toBe('ended');
    expect(handle.remoteExitCode).toBe(1);
    expect(handle.stderrTail).toContain('no configuration file found: media');
  });

  it('reports exit code 0 on a successful remote command', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    channel.emit('data', Buffer.from('line\n', 'utf8'));
    channel.emit('exit', 0);
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['line']);
    expect(handle.remoteExitCode).toBe(0);
  });

  it('reports a null exit code when the channel closes without an exit event', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false });

    channel.emit('close');

    await expect(handle.done).resolves.toBe('ended');
    expect(handle.remoteExitCode).toBeNull();
  });

  it('an exec failure (channel acquisition) rejects — the use case maps it to a refusal', async () => {
    const exec = vi.fn(async () => {
      throw new Error('ssh connect failed');
    });
    const source = { exec, sftp: vi.fn(), streamLocal: vi.fn() } as unknown as SshChannelSource;

    await expect(new RemoteComposeLogsAdapter(source).stream({ stack: 'media', follow: false })).rejects.toThrow(
      'ssh connect failed'
    );
  });
});
