// infrastructure/StreamLocalAgentChannel.test.ts — STRICT TDD RED phase
import { EventEmitter } from 'node:events';
import { once } from 'node:events';

import { describe, expect, it, vi } from 'vitest';
import type { Duplex } from 'node:stream';
import type { ClientChannel } from 'ssh2';

// RED: import the port and adapter that don't exist yet
import { DEFAULT_AGENT_SOCKET_PATH } from '../application/AgentChannel.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../application/RemoteCommandRunner.js';
import { StreamLocalAgentChannel } from './StreamLocalAgentChannel.js';
import type { SshChannelSource } from './SshConnectionManager.js';

interface FakeChannel extends EventEmitter {
  stderr: EventEmitter & { resume: ReturnType<typeof vi.fn> };
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  isPaused: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function createFakeChannel(): FakeChannel {
  const channel = new EventEmitter() as FakeChannel;
  channel.stderr = Object.assign(new EventEmitter(), { resume: vi.fn() });
  channel.write = vi.fn(() => true);
  channel.end = vi.fn();
  channel.pause = vi.fn();
  channel.resume = vi.fn();
  channel.isPaused = vi.fn(() => false);
  channel.close = vi.fn();
  return channel;
}

function createChannelsFake(streamLocalImpl: (socketPath: string) => Promise<FakeChannel>): {
  channels: SshChannelSource;
  streamLocal: ReturnType<typeof vi.fn>;
} {
  const streamLocal = vi.fn((socketPath: string) => streamLocalImpl(socketPath) as unknown as Promise<ClientChannel>);
  return {
    channels: {
      exec: vi.fn(async () => {
        throw new Error('exec not used in this test');
      }),
      sftp: vi.fn(async () => {
        throw new Error('sftp not used in this test');
      }),
      streamLocal,
    },
    streamLocal,
  };
}

function createRunnerFake(home?: string): { runner: RemoteCommandRunner; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async (): Promise<RemoteCommandResult> => ({
    stdout: home ?? '/home/ops',
    stderr: '',
    exitCode: 0,
  }));
  return { runner: { run }, run };
}

function flushAsync(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

describe('StreamLocalAgentChannel', () => {
  it('2.7 RED: expands ~ in the socket path using the remote home directory', async () => {
    const channel = createFakeChannel();
    const { channels, streamLocal } = createChannelsFake(() => Promise.resolve(channel));
    const { runner } = createRunnerFake('/home/ops');
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    await agentChannel.open();

    expect(runner.run).toHaveBeenCalledWith('printf %s "$HOME"');
    expect(streamLocal).toHaveBeenCalledWith('/home/ops/.tako/agent.sock');
  });

  it('2.7 RED: passes absolute socket paths through without resolving the remote home', async () => {
    const channel = createFakeChannel();
    const { channels, streamLocal } = createChannelsFake(() => Promise.resolve(channel));
    const { runner, run } = createRunnerFake();
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    await agentChannel.open({ socketPath: '/run/tako/agent.sock' });

    expect(run).not.toHaveBeenCalled();
    expect(streamLocal).toHaveBeenCalledWith('/run/tako/agent.sock');
  });

  it('2.7 RED: defaults to the agent socket path constant', async () => {
    const channel = createFakeChannel();
    const { channels, streamLocal } = createChannelsFake(() => Promise.resolve(channel));
    const { runner } = createRunnerFake('/home/ops');
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    await agentChannel.open({ socketPath: DEFAULT_AGENT_SOCKET_PATH });

    expect(streamLocal).toHaveBeenCalledWith('/home/ops/.tako/agent.sock');
  });

  it('2.7 RED: splits incoming channel bytes into line frames, buffering partial lines', async () => {
    const channel = createFakeChannel();
    const { channels } = createChannelsFake(() => Promise.resolve(channel));
    const { runner } = createRunnerFake();
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    const stream: Duplex = await agentChannel.open();
    const frames: string[] = [];
    stream.on('data', (frame: string) => frames.push(frame));

    channel.emit('data', Buffer.from('hello\nwor'));
    channel.emit('data', Buffer.from('ld\npartial'));
    channel.emit('data', Buffer.from(' line\n'));
    await flushAsync();

    expect(frames).toEqual(['hello', 'world', 'partial line']);
  });

  it('2.7 RED: appends the newline delimiter to every written frame', async () => {
    const channel = createFakeChannel();
    const { channels } = createChannelsFake(() => Promise.resolve(channel));
    const { runner } = createRunnerFake();
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    const stream: Duplex = await agentChannel.open();
    const writeDone = new Promise<void>((resolve, reject) => {
      stream.write('{"v":1}', err => (err ? reject(err) : resolve()));
    });
    await writeDone;

    expect(channel.write).toHaveBeenCalledWith('{"v":1}\n');
  });

  it('2.7 RED: rejects non-string frames instead of forwarding them', async () => {
    const channel = createFakeChannel();
    const { channels } = createChannelsFake(() => Promise.resolve(channel));
    const { runner } = createRunnerFake();
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    const stream: Duplex = await agentChannel.open();
    // Node emits 'error' on the stream in addition to the write callback error.
    stream.on('error', () => {});
    const writeDone = new Promise<void>((resolve, reject) => {
      stream.write(42 as unknown as string, err => (err ? reject(err) : resolve()));
    });

    await expect(writeDone).rejects.toThrow('must be strings');
    expect(channel.write).not.toHaveBeenCalled();
  });

  it('2.7 RED: finishes the underlying channel when the stream ends', async () => {
    const channel = createFakeChannel();
    const { channels } = createChannelsFake(() => Promise.resolve(channel));
    const { runner } = createRunnerFake();
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    const stream: Duplex = await agentChannel.open();
    stream.end();
    await once(stream, 'finish');

    expect(channel.end).toHaveBeenCalled();
  });

  it('2.7 RED: destroys the stream with the error when the channel errors', async () => {
    const channel = createFakeChannel();
    const { channels } = createChannelsFake(() => Promise.resolve(channel));
    const { runner } = createRunnerFake();
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    const stream: Duplex = await agentChannel.open();
    const failure = once(stream, 'error') as Promise<[Error]>;
    channel.emit('error', new Error('forward failed'));

    const [err] = await failure;
    expect(err.message).toBe('forward failed');
  });

  it('2.7 RED: close() tears down every channel opened by the instance', async () => {
    const channelOne = createFakeChannel();
    const channelTwo = createFakeChannel();
    let opens = 0;
    const { channels } = createChannelsFake(() => {
      opens += 1;
      return Promise.resolve(opens === 1 ? channelOne : channelTwo);
    });
    const { runner } = createRunnerFake();
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    await agentChannel.open();
    await agentChannel.open();
    await agentChannel.close();
    await flushAsync();

    expect(channelOne.close).toHaveBeenCalled();
    expect(channelTwo.close).toHaveBeenCalled();
  });

  it('2.7 fix: flushes frames buffered behind backpressure without new channel bytes', async () => {
    const channel = createFakeChannel();
    const { channels } = createChannelsFake(() => Promise.resolve(channel));
    const { runner } = createRunnerFake();
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    const stream: Duplex = await agentChannel.open();
    // One burst of 40 complete frames; objectMode hwm (16) forces backpressure.
    const burst =
      Array.from({ length: 40 }, (_, i) => `frame${i}`).join('\n') + '\n';
    channel.emit('data', Buffer.from(burst));
    await flushAsync();

    // Consumer attaches AFTER the burst (idle agent, post-backpressure case).
    const frames: string[] = [];
    const received = new Promise<void>(resolve => {
      stream.on('data', (frame: string) => {
        frames.push(frame);
        if (frames.length === 40) {
          resolve();
        }
      });
    });
    const timeout = new Promise(resolve => setTimeout(resolve, 100));
    await Promise.race([received, timeout]);

    expect(frames).toHaveLength(40);
  });

  it('2.7 fix: settles a pending write when the channel closes before draining', async () => {
    const channel = createFakeChannel();
    channel.write = vi.fn(() => false); // force the drain-wait path
    const { channels } = createChannelsFake(() => Promise.resolve(channel));
    const { runner } = createRunnerFake();
    const agentChannel = new StreamLocalAgentChannel(channels, runner);

    const stream: Duplex = await agentChannel.open();
    stream.on('error', () => {});
    const writeDone = new Promise<void>((resolve, reject) => {
      stream.write('{"v":1}', err => (err ? reject(err) : resolve()));
    });
    await flushAsync();
    channel.emit('close');

    await expect(writeDone).rejects.toThrow('closed before a written frame could drain');
  });
});
