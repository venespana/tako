// infrastructure/SshRemoteCommandRunner.test.ts — STRICT TDD RED phase
import { EventEmitter } from 'node:events';

import type { ClientChannel } from 'ssh2';
import { describe, expect, it, vi } from 'vitest';

// RED: import the port types and adapter that don't exist yet
import type { SshChannelSource } from './SshConnectionManager.js';
import { SshRemoteCommandRunner } from './SshRemoteCommandRunner.js';
import type { RemoteCommandResult } from '../application/RemoteCommandRunner.js';

interface FakeChannel extends EventEmitter {
  stderr: EventEmitter;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

function createFakeChannel(): FakeChannel {
  const channel = new EventEmitter() as FakeChannel;
  channel.stderr = new EventEmitter();
  channel.write = vi.fn(() => true);
  channel.end = vi.fn();
  return channel;
}

function createChannelSource(execImpl: () => Promise<FakeChannel>): SshChannelSource {
  return {
    exec: vi.fn(() => execImpl() as unknown as Promise<ClientChannel>),
    sftp: vi.fn(async () => {
      throw new Error('sftp not used in this test');
    }),
    streamLocal: vi.fn(async () => {
      throw new Error('streamLocal not used in this test');
    }),
  };
}

function flushAsync(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

describe('SshRemoteCommandRunner', () => {
  it('2.5 RED: captures stdout, stderr and exit code from the exec channel', async () => {
    let channelRef: FakeChannel | undefined;
    const runner = new SshRemoteCommandRunner(
      createChannelSource(() => {
        channelRef = createFakeChannel();
        return Promise.resolve(channelRef);
      })
    );

    const pending = runner.run('uname -m');
    await flushAsync();

    channelRef?.emit('data', Buffer.from('x86_64\n'));
    channelRef?.stderr.emit('data', Buffer.from('warning: deprecated\n'));
    channelRef?.emit('exit', 0, null);
    channelRef?.emit('close', 0, null);

    const result: RemoteCommandResult = await pending;
    expect(result).toEqual({ stdout: 'x86_64\n', stderr: 'warning: deprecated\n', exitCode: 0 });
    expect(channelRef?.end).not.toHaveBeenCalled();
  });

  it('2.5 RED: returns a non-zero exit status as a result instead of throwing', async () => {
    let channelRef: FakeChannel | undefined;
    const runner = new SshRemoteCommandRunner(
      createChannelSource(() => {
        channelRef = createFakeChannel();
        return Promise.resolve(channelRef);
      })
    );

    const pending = runner.run('systemctl --user is-active tako-agent.service');
    await flushAsync();

    channelRef?.emit('exit', 3, null);
    channelRef?.emit('close', 3, null);

    const result = await pending;
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('2.5 RED: reports exit code null when the command is killed by a signal', async () => {
    let channelRef: FakeChannel | undefined;
    const runner = new SshRemoteCommandRunner(
      createChannelSource(() => {
        channelRef = createFakeChannel();
        return Promise.resolve(channelRef);
      })
    );

    const pending = runner.run('sleep 3600');
    await flushAsync();

    channelRef?.emit('exit', null, 'TERM');
    channelRef?.emit('close', null, 'TERM');

    const result = await pending;
    expect(result.exitCode).toBeNull();
  });

  it('2.5 RED: rejects when the channel errors before closing', async () => {
    let channelRef: FakeChannel | undefined;
    const runner = new SshRemoteCommandRunner(
      createChannelSource(() => {
        channelRef = createFakeChannel();
        return Promise.resolve(channelRef);
      })
    );

    const pending = runner.run('echo hi');
    await flushAsync();

    channelRef?.emit('error', new Error('channel closed unexpectedly'));

    await expect(pending).rejects.toThrow('channel closed unexpectedly');
  });

  it('6.9 RED: rejects as a transport failure when the channel closes without an exit event', async () => {
    let channelRef: FakeChannel | undefined;
    const runner = new SshRemoteCommandRunner(
      createChannelSource(() => {
        channelRef = createFakeChannel();
        return Promise.resolve(channelRef);
      })
    );

    const pending = runner.run('systemctl --user is-active tako-agent.service');
    await flushAsync();

    // The connection drops mid-command: ssh2 emits 'close' with NO prior
    // 'exit'. Partial stdout must NOT be resolved as a result — for probes
    // like is-active an exitCode-less stdout is ambiguous.
    channelRef?.emit('data', Buffer.from('active\n'));
    channelRef?.emit('close');

    await expect(pending).rejects.toThrow(/closed without an exit status/);
  });

  it('2.5 RED: decodes multibyte utf8 output split across data chunks', async () => {
    let channelRef: FakeChannel | undefined;
    const runner = new SshRemoteCommandRunner(
      createChannelSource(() => {
        channelRef = createFakeChannel();
        return Promise.resolve(channelRef);
      })
    );

    const pending = runner.run('echo café');
    await flushAsync();

    // 'é' is 0xC3 0xA9 in utf8 — split it across two chunks.
    channelRef?.emit('data', Buffer.from([0x63, 0x61, 0x66, 0xc3]));
    channelRef?.emit('data', Buffer.from([0xa9, 0x0a]));
    channelRef?.emit('exit', 0, null);
    channelRef?.emit('close', 0, null);

    const result = await pending;
    expect(result.stdout).toBe('café\n');
  });
});
