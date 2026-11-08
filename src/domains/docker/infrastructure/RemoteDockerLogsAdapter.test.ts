// RemoteDockerLogsAdapter.test.ts — ContainerLogStreamer over SshChannelSource
// (tui-live-logs T1). The adapter is a translation layer: ONE fixed remote
// command shape (tail + single-quoted name), StringDecoder line integrity
// across chunk boundaries, and the handle contract — channel error → the
// iterator throws, channel close → done 'ended', stop() → channel close and
// done 'stopped'. Nothing here opens SSH; the channel source is injected.
import { EventEmitter } from 'node:events';

import type { ClientChannel } from 'ssh2';
import { describe, expect, it, vi } from 'vitest';

import { dockerLogsCommand, RemoteDockerLogsAdapter } from './RemoteDockerLogsAdapter.js';
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

describe('RemoteDockerLogsAdapter — command discipline', () => {
  it('runs the fixed docker logs follow command with the tail and single-quoted name', async () => {
    const channel = createFakeChannel();
    const { exec, source } = sourceServing(channel);

    await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith("docker logs -f --tail 200 'web-1'");
  });

  it('honors a custom tail', async () => {
    const channel = createFakeChannel();
    const { exec, source } = sourceServing(channel);

    await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 50 });

    expect(exec).toHaveBeenCalledWith("docker logs -f --tail 50 'web-1'");
  });

  it('single-quote-escapes even quote-bearing names (defense in depth behind the use case)', () => {
    expect(dockerLogsCommand("a'b", 10)).toBe(`docker logs -f --tail 10 'a'\\''b'`);
  });
});

describe('RemoteDockerLogsAdapter — line integrity', () => {
  it('reassembles lines split across chunks (StringDecoder discipline)', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    channel.emit('data', Buffer.from('he', 'utf8'));
    channel.emit('data', Buffer.from('llo wo', 'utf8'));
    channel.emit('data', Buffer.from('rld\n', 'utf8'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['hello world']);
  });

  it('keeps multibyte characters intact when a chunk splits one', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    const full = Buffer.from('wèb\n', 'utf8');
    channel.emit('data', full.subarray(0, 2));
    channel.emit('data', full.subarray(2));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['wèb']);
  });

  it('splits multiple lines per chunk and strips \\r from \\r\\n endings', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    channel.emit('data', Buffer.from('one\ntwo\r\nthree\r\n', 'utf8'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['one', 'two', 'three']);
  });

  it('flushes a trailing partial line when the channel closes', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    channel.emit('data', Buffer.from('a\npartial-without-newline', 'utf8'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['a', 'partial-without-newline']);
  });
});

describe('RemoteDockerLogsAdapter — CR-only progress lines (FU6)', () => {
  it('emits lines incrementally on lone \\r terminators as chunks arrive (progressive tail -f output)', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    const iterator = handle.lines[Symbol.asyncIterator]();
    const first = iterator.next();

    // Two \r-terminated progress redraws, no \n anywhere: the first line
    // must surface when the SECOND chunk arrives — driven by the data
    // events, not by the stream ending.
    channel.emit('data', Buffer.from('progress 0%\r'));
    channel.emit('data', Buffer.from('progress 50%\r'));

    await expect(first).resolves.toEqual({ value: 'progress 0%', done: false });

    const second = iterator.next();
    channel.emit('close');

    await expect(second).resolves.toEqual({ value: 'progress 50%', done: false });
  });

  it('collects a \\r-only stream as separate lines, not one merged partial', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    channel.emit('data', Buffer.from('one\r'));
    channel.emit('data', Buffer.from('two\r'));
    channel.emit('data', Buffer.from('three\r'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['one', 'two', 'three']);
  });

  // Regression pin for the CR rewire: a \r\n pair is ONE terminator even
  // when the pair straddles a chunk boundary (the \r rides at the end of
  // one chunk, the \n opens the next) — exactly one line, no empty extra.
  it('emits exactly ONE line for a \\r\\n pair straddling a chunk boundary', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    channel.emit('data', Buffer.from('crlf\r'));
    channel.emit('data', Buffer.from('\nafter\n'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['crlf', 'after']);
  });
});

describe('RemoteDockerLogsAdapter — the partial buffer stays bounded (FU6)', () => {
  it('flushes an un-terminated partial as a line once it exceeds the 8 KiB cap', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    const iterator = handle.lines[Symbol.asyncIterator]();
    const oversized = iterator.next();

    // 8 KiB + 1 char with no terminator: the partial flushes as a line on
    // arrival — unbounded progress spam cannot grow memory.
    channel.emit('data', Buffer.from('a'.repeat(8193)));

    await expect(oversized).resolves.toEqual({ value: 'a'.repeat(8193), done: false });
  });

  it('keeps the stream alive after a cap flush and holds exactly-at-cap partials', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    const iterator = handle.lines[Symbol.asyncIterator]();
    const oversized = iterator.next();

    channel.emit('data', Buffer.from('a'.repeat(8193)));
    await expect(oversized).resolves.toEqual({ value: 'a'.repeat(8193), done: false });

    // At exactly the cap nothing flushes yet: the partial keeps growing
    // until a terminator or the cap is EXCEEDED.
    const atCap = iterator.next();
    channel.emit('data', Buffer.from('b'.repeat(8192)));
    channel.emit('data', Buffer.from('c\ndone\n'));
    await expect(atCap).resolves.toEqual({ value: `${'b'.repeat(8192)}c`, done: false });

    // The stream is alive and still delivering after a cap flush.
    channel.emit('close');
    await expect(collect(handle.lines)).resolves.toEqual(['done']);
  });
});

describe('RemoteDockerLogsAdapter — stderr is part of the log stream', () => {
  it('surfaces stderr lines (containers logging to stderr would otherwise show nothing)', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    channel.emit('data', Buffer.from('stdout line\n', 'utf8'));
    channel.stderr.emit('data', Buffer.from('stderr line\n', 'utf8'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['stdout line', 'stderr line']);
  });

  it('keeps stderr line integrity: split chunks and multibyte characters across stderr', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    const full = Buffer.from('èrror\n', 'utf8');
    channel.stderr.emit('data', full.subarray(0, 2));
    channel.stderr.emit('data', full.subarray(2));
    channel.stderr.emit('data', Buffer.from('partial tail', 'utf8'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['èrror', 'partial tail']);
  });

  it('a stderr-only stream still ends when the channel closes', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    channel.stderr.emit('data', Buffer.from('only stderr\n', 'utf8'));
    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual(['only stderr']);
    await expect(handle.done).resolves.toBe('ended');
  });
});

describe('RemoteDockerLogsAdapter — handle contract', () => {
  it('channel close ends the iterator and resolves done as ended', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    channel.emit('close');

    await expect(collect(handle.lines)).resolves.toEqual([]);
    await expect(handle.done).resolves.toBe('ended');
    expect(channel.close).not.toHaveBeenCalled();
  });

  it('channel error makes the iterator throw the transport failure', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    channel.emit('error', new Error('channel blew up'));

    await expect(collect(handle.lines)).rejects.toThrow('channel blew up');
  });

  it('drains already-buffered lines before surfacing a channel error', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    channel.emit('data', Buffer.from('survivor\n', 'utf8'));
    channel.emit('error', new Error('dropped mid-stream'));

    const collected: string[] = [];

    await expect(collect(handle.lines, collected)).rejects.toThrow('dropped mid-stream');
    expect(collected).toEqual(['survivor']);
  });

  it('stop() closes the channel exactly once and resolves done as stopped', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    await handle.stop();
    await handle.stop();

    expect(channel.close).toHaveBeenCalledTimes(1);
    await expect(handle.done).resolves.toBe('stopped');
    // Lines already buffered stay consumable; production simply ends.
    await expect(collect(handle.lines)).resolves.toEqual([]);
  });

  it('a close event racing after stop() never overrides the stopped outcome', async () => {
    const channel = createFakeChannel();
    const { source } = sourceServing(channel);
    const handle = await new RemoteDockerLogsAdapter(source).stream({ container: 'web-1', tail: 200 });

    await handle.stop();
    channel.emit('close');

    await expect(handle.done).resolves.toBe('stopped');
  });
});
