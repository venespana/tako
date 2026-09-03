// infrastructure/Ssh2ConnectionTester.test.ts — STRICT TDD RED phase
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SshTestConfig } from '../domain/types.js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

// Partial module mocks (ESM namespaces are non-configurable, so vi.spyOn
// cannot intercept them — and the SUT's named imports could never be spied).
// Per-test behavior is configured via vi.mocked(); reset in afterEach.
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
import { Ssh2ConnectionTester } from './Ssh2ConnectionTester.js';

// Helper type for mock client - we use any because the implementation doesn't need the full Client interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockClientFactory(mockClient: any): any {
  return () => mockClient;
}

describe('Ssh2ConnectionTester', () => {
  describe('test()', () => {
    it('4.5 RED: success outcome has ok:true and hostkeyFingerprint', async () => {
      const mockClient = {
        once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'ready') {
            setTimeout(() => cb(), 10);
          }
          return mockClient;
        }),
        connect: vi.fn(() => mockClient),
        end: vi.fn(),
      };

      const tester = new Ssh2ConnectionTester(createMockClientFactory(mockClient));

      const config: SshTestConfig = {
        host: '10.0.0.5',
        port: 22,
        username: 'ops',
        auth: { type: 'password', password: 'hunter2' },
      };

      const outcome = await tester.test(config);

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        // SHA256 fingerprint format: base64 string
        expect(outcome.hostkeyFingerprint).toMatch(/^[A-Za-z0-9+/=]+$/);
      }
    });

    it('4.5 RED: error outcome maps ECONNREFUSED to network category', async () => {
      const mockClient = {
        once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'error') {
            const err = new Error('Connection refused') as Error & { code: string };
            err.code = 'ECONNREFUSED';
            setTimeout(() => cb(err), 10);
          }
          return mockClient;
        }),
        connect: vi.fn(() => mockClient),
        end: vi.fn(),
      };

      const tester = new Ssh2ConnectionTester(createMockClientFactory(mockClient));

      const config: SshTestConfig = {
        host: '10.0.0.5',
        port: 22,
        username: 'ops',
        auth: { type: 'password', password: 'hunter2' },
      };

      const outcome = await tester.test(config);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.category).toBe('network');
      }
    });

    it('4.5 RED: error outcome maps ETIMEDOUT to timeout category', async () => {
      const mockClient = {
        once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'error') {
            const err = new Error('Connection timed out') as Error & { code: string };
            err.code = 'ETIMEDOUT';
            setTimeout(() => cb(err), 10);
          }
          return mockClient;
        }),
        connect: vi.fn(() => mockClient),
        end: vi.fn(),
      };

      const tester = new Ssh2ConnectionTester(createMockClientFactory(mockClient));

      const config: SshTestConfig = {
        host: '10.0.0.5',
        port: 22,
        username: 'ops',
        auth: { type: 'password', password: 'hunter2' },
      };

      const outcome = await tester.test(config);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.category).toBe('timeout');
      }
    });

    it('4.5 RED: error outcome maps auth failure to auth category', async () => {
      const mockClient = {
        once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'error') {
            const err = new Error('Auth failed') as Error & { level: string };
            err.level = 'client-authentication';
            setTimeout(() => cb(err), 10);
          }
          return mockClient;
        }),
        connect: vi.fn(() => mockClient),
        end: vi.fn(),
      };

      const tester = new Ssh2ConnectionTester(createMockClientFactory(mockClient));

      const config: SshTestConfig = {
        host: '10.0.0.5',
        port: 22,
        username: 'ops',
        auth: { type: 'password', password: 'hunter2' },
      };

      const outcome = await tester.test(config);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.category).toBe('auth');
      }
    });

    it('4.5 RED: error outcome maps hostkey failure to hostkey category', async () => {
      const mockClient = {
        once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'error') {
            const err = new Error('Hostkey invalid') as Error & { level: string };
            err.level = 'client-verification';
            setTimeout(() => cb(err), 10);
          }
          return mockClient;
        }),
        connect: vi.fn(() => mockClient),
        end: vi.fn(),
      };

      const tester = new Ssh2ConnectionTester(createMockClientFactory(mockClient));

      const config: SshTestConfig = {
        host: '10.0.0.5',
        port: 22,
        username: 'ops',
        auth: { type: 'password', password: 'hunter2' },
      };

      const outcome = await tester.test(config);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.category).toBe('hostkey');
      }
    });

    it('4.5 RED: password auth passes password to connect config', async () => {
      const mockClient = {
        once: vi.fn(() => mockClient),
        connect: vi.fn(() => mockClient),
        end: vi.fn(),
      };

      const tester = new Ssh2ConnectionTester(createMockClientFactory(mockClient));

      const config: SshTestConfig = {
        host: '10.0.0.5',
        port: 22,
        username: 'ops',
        auth: { type: 'password', password: 'hunter2' },
      };

      tester.test(config);

      await new Promise(r => setImmediate(r));

      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'hunter2',
        })
      );
    });

    it('4.5 RED: key auth reads key file and passes content to connect', async () => {
      vi.mocked(readFileSync).mockReturnValue(
        '-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key-content\n-----END OPENSSH PRIVATE KEY-----'
      );
      vi.mocked(homedir).mockReturnValue('/home/ops');

      const mockClient = {
        once: vi.fn(() => mockClient),
        connect: vi.fn(() => mockClient),
        end: vi.fn(),
      };

      const tester = new Ssh2ConnectionTester(createMockClientFactory(mockClient));

      const config: SshTestConfig = {
        host: '10.0.0.5',
        port: 22,
        username: 'ops',
        auth: { type: 'key', keyPath: '/home/ops/.ssh/id_rsa' },
      };

      tester.test(config);

      await new Promise(r => setImmediate(r));

      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key-content\n-----END OPENSSH PRIVATE KEY-----',
        })
      );
    });

    it('4.5 RED: key auth with ~/ expands to home directory', async () => {
      vi.mocked(readFileSync).mockReturnValue(
        '-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key\n-----END OPENSSH PRIVATE KEY-----'
      );
      vi.mocked(homedir).mockReturnValue('/home/ops');

      const mockClient = {
        once: vi.fn(() => mockClient),
        connect: vi.fn(() => mockClient),
        end: vi.fn(),
      };

      const tester = new Ssh2ConnectionTester(createMockClientFactory(mockClient));

      const config: SshTestConfig = {
        host: '10.0.0.5',
        port: 22,
        username: 'ops',
        auth: { type: 'key', keyPath: '~/.ssh/id_rsa' },
      };

      tester.test(config);

      await new Promise(r => setImmediate(r));

      expect(readFileSync).toHaveBeenCalledWith('/home/ops/.ssh/id_rsa', 'utf8');
      expect(homedir).toHaveBeenCalled();
    });

    it('4.5 RED: readyTimeout is set to 10_000', async () => {
      const mockClient = {
        once: vi.fn(() => mockClient),
        connect: vi.fn(() => mockClient),
        end: vi.fn(),
      };

      const tester = new Ssh2ConnectionTester(createMockClientFactory(mockClient));

      const config: SshTestConfig = {
        host: '10.0.0.5',
        port: 22,
        username: 'ops',
        auth: { type: 'password', password: 'hunter2' },
      };

      tester.test(config);

      await new Promise(r => setImmediate(r));

      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          readyTimeout: 10_000,
        })
      );
    });

    it('4.5 RED: hostVerifier accepts and captures fingerprint', async () => {
      const mockClient = {
        once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'ready') {
            setTimeout(() => cb(), 10);
          }
          return mockClient;
        }),
        connect: vi.fn(() => mockClient),
        end: vi.fn(),
      };

      const tester = new Ssh2ConnectionTester(createMockClientFactory(mockClient));

      const config: SshTestConfig = {
        host: '10.0.0.5',
        port: 22,
        username: 'ops',
        auth: { type: 'password', password: 'hunter2' },
      };

      const outcome = await tester.test(config);

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.hostkeyFingerprint).toBeTruthy();
      }
    });
  });
});
