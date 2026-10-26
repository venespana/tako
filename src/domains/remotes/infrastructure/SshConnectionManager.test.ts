// infrastructure/SshConnectionManager.test.ts — STRICT TDD RED phase
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

import type { Client } from 'ssh2';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn() };
});

vi.mock('node:os', async importOriginal => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn() };
});

afterEach(() => {
  vi.mocked(readFileSync).mockReset();
  vi.mocked(homedir).mockReset();
});

// RED: import the class that doesn't exist yet
import { SshConnectionManager } from './SshConnectionManager.js';
import type { SshConnectConfig } from './SshConnectionManager.js';

type Callback<T> = (err: Error | undefined, value: T) => void;

interface FakeChannel extends EventEmitter {
  stderr: EventEmitter;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
}

function createFakeChannel(): FakeChannel {
  const channel = new EventEmitter() as FakeChannel;
  channel.stderr = new EventEmitter();
  channel.write = vi.fn(() => true);
  channel.end = vi.fn();
  channel.pause = vi.fn();
  channel.resume = vi.fn();
  return channel;
}

interface FakeSftp {
  fastPut: ReturnType<typeof vi.fn>;
  fastGet: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

function createFakeSftp(): FakeSftp {
  return {
    fastPut: vi.fn((_local: string, _remote: string, cb: Callback<void>) =>
      setImmediate(() => cb(undefined, undefined))
    ),
    fastGet: vi.fn((_remote: string, _local: string, cb: Callback<void>) =>
      setImmediate(() => cb(undefined, undefined))
    ),
    end: vi.fn(),
  };
}

interface FakeClient extends EventEmitter {
  connect: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
  sftp: ReturnType<typeof vi.fn>;
  openssh_forwardOutStreamLocal: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

function createFakeClient(): FakeClient {
  const client = new EventEmitter() as FakeClient;
  client.connect = vi.fn(() => {
    setImmediate(() => client.emit('ready'));
    return client;
  });
  client.exec = vi.fn((_command: string, cb: Callback<FakeChannel>) => {
    setImmediate(() => cb(undefined, createFakeChannel()));
    return client;
  });
  client.sftp = vi.fn((cb: Callback<FakeSftp>) => {
    setImmediate(() => cb(undefined, createFakeSftp()));
    return client;
  });
  client.openssh_forwardOutStreamLocal = vi.fn((socketPath: string, cb: Callback<FakeChannel>) => {
    void socketPath;
    setImmediate(() => cb(undefined, createFakeChannel()));
    return client;
  });
  client.end = vi.fn();
  return client;
}

const baseConfig: SshConnectConfig = {
  host: '10.0.0.5',
  port: 22,
  username: 'ops',
  auth: { type: 'password', password: 'hunter2' },
};

function createManager(clientFactory?: () => FakeClient): {
  manager: SshConnectionManager;
  clients: FakeClient[];
} {
  const clients: FakeClient[] = [];
  const factory =
    clientFactory ??
    (() => {
      const client = createFakeClient();
      clients.push(client);
      return client;
    });
  const manager = new SshConnectionManager(baseConfig, factory as unknown as () => Client);
  return { manager, clients };
}

function flushAsync(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

describe('SshConnectionManager', () => {
  describe('connection lifecycle', () => {
    it('2.4 RED: opens exactly one connection for concurrent exec and sftp channels', async () => {
      const { manager, clients } = createManager();

      const [channel, sftp] = await Promise.all([manager.exec('echo hi'), manager.sftp()]);

      expect(clients).toHaveLength(1);
      expect(clients[0]?.connect).toHaveBeenCalledTimes(1);
      expect(channel).toBeInstanceOf(EventEmitter);
      expect(sftp).toBeDefined();
    });

    it('2.4 RED: reuses the live connection for sequential channel requests', async () => {
      const { manager, clients } = createManager();

      await manager.exec('echo one');
      await manager.exec('echo two');

      expect(clients).toHaveLength(1);
      expect(clients[0]?.connect).toHaveBeenCalledTimes(1);
      expect(clients[0]?.exec).toHaveBeenCalledTimes(2);
    });

    it('2.4 RED: rejects channel open when authentication fails and allows retry', async () => {
      let connections = 0;
      const { manager, clients } = createManager(() => {
        const client = createFakeClient();
        connections += 1;

        if (connections === 1) {
          client.connect.mockImplementation(() => {
            setImmediate(() =>
              client.emit(
                'error',
                Object.assign(new Error('All authentication methods failed'), { level: 'client-authentication' })
              )
            );
            return client;
          });
        }

        clients.push(client);
        return client;
      });

      await expect(manager.exec('echo hi')).rejects.toThrow('All authentication methods failed');

      const channel = await manager.exec('echo hi');
      expect(clients).toHaveLength(2);
      expect(channel).toBeInstanceOf(EventEmitter);
    });

    it('2.4 RED: reconnects with a fresh client after the live connection drops', async () => {
      const { manager, clients } = createManager();

      await manager.exec('echo one');
      clients[0]?.emit('close');
      await flushAsync();

      await manager.exec('echo two');

      expect(clients).toHaveLength(2);
      expect(clients[1]?.connect).toHaveBeenCalledTimes(1);
    });

    it('2.4 RED: end() closes the live client and the next request reconnects', async () => {
      const { manager, clients } = createManager();

      await manager.exec('echo one');
      await manager.end();
      expect(clients[0]?.end).toHaveBeenCalledTimes(1);

      await manager.exec('echo two');

      expect(clients).toHaveLength(2);
      expect(clients[0]?.connect).toHaveBeenCalledTimes(1);
      expect(clients[1]?.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('channel factories', () => {
    it('2.4 RED: exec forwards the command to client.exec and resolves the channel', async () => {
      const { manager, clients } = createManager();

      const channel = await manager.exec('uname -m');

      expect(clients[0]?.exec).toHaveBeenCalledWith('uname -m', expect.any(Function));
      expect(channel).toBeInstanceOf(EventEmitter);
    });

    it('2.4 RED: streamLocal forwards the socket path to openssh_forwardOutStreamLocal', async () => {
      const { manager, clients } = createManager();

      const channel = await manager.streamLocal('/home/ops/.tako/agent.sock');

      expect(clients[0]?.openssh_forwardOutStreamLocal).toHaveBeenCalledWith(
        '/home/ops/.tako/agent.sock',
        expect.any(Function)
      );
      expect(channel).toBeInstanceOf(EventEmitter);
    });

    it('2.4 RED: rejects exec when the server refuses the channel', async () => {
      const { manager } = createManager(() => {
        const client = createFakeClient();
        client.exec.mockImplementation((_command: string, cb: Callback<FakeChannel>) => {
          setImmediate(() => cb(new Error('Channel open failure'), createFakeChannel()));
          return client;
        });
        return client;
      });

      await expect(manager.exec('echo hi')).rejects.toThrow('Channel open failure');
    });
  });

  describe('auth material', () => {
    it('2.4 RED: key auth reads the key file and passes its content to connect', async () => {
      vi.mocked(readFileSync).mockReturnValue(
        '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----'
      );
      vi.mocked(homedir).mockReturnValue('/home/ops');

      const clients: FakeClient[] = [];
      const keyedManager = new SshConnectionManager(
        { host: '10.0.0.5', port: 22, username: 'ops', auth: { type: 'key', keyPath: '~/.ssh/id_ed25519' } },
        () => {
          const client = createFakeClient();
          clients.push(client);
          return client as unknown as Client;
        }
      );

      await keyedManager.exec('echo hi');

      expect(readFileSync).toHaveBeenCalledWith('/home/ops/.ssh/id_ed25519', 'utf8');
      expect(clients[0]?.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----',
        })
      );
    });
  });

  describe('connect configuration', () => {
    it('T4: the connect config carries keepaliveInterval 15000 so dead connections surface', async () => {
      const { manager, clients } = createManager();

      await manager.exec('echo hi');

      expect(clients[0]?.connect).toHaveBeenCalledWith(expect.objectContaining({ keepaliveInterval: 15_000 }));
    });
  });
});
