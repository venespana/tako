// LocalHostToolChecker.test.ts — adapter unit test
import { describe, it, expect } from 'vitest';

import { LocalHostToolChecker } from './LocalHostToolChecker.js';

describe('LocalHostToolChecker', () => {
  // ssh now uses script wrapper: ['/usr/bin/script', '-qc', 'ssh -V', '/dev/null']
  // git/docker use direct: [tool, flag]
  function createFakeSpawn(
    responses: Map<string, { stdout: string; stderr: string; exitCode: number; enoent?: boolean }>
  ) {
    return (args: string[]) => {
      // ssh wrapped: args[0] = '/usr/bin/script'
      // git/docker direct: args[0] = 'git' or 'docker'
      const key = args[0]!;
      const response = responses.get(key);

      if (!response) {
        throw new Error(`No mock configured for tool: ${key}`);
      }

      if (response.enoent) {
        const error = new Error('ENOENT: no such file or directory') as Error & { code: string };
        error.code = 'ENOENT';
        throw error;
      }

      return {
        stdout: { text: async () => response.stdout },
        stderr: { text: async () => response.stderr },
        exited: response.exitCode,
      };
    };
  }

  it('ENOENT → status:not-found, version:null', async () => {
    // ssh uses script wrapper — key is '/usr/bin/script'
    const spawnMock = createFakeSpawn(
      new Map([['/usr/bin/script', { stdout: '', stderr: '', exitCode: 127, enoent: true }]])
    );

    const checker = new LocalHostToolChecker(spawnMock as unknown as typeof Bun.spawn);
    const result = await checker.check('ssh');

    expect(result.status).toBe('not-found');
    expect(result.version).toBeNull();
    expect(result.tool).toBe('ssh');
  });

  it('exitCode !== 0 → status:found, version:null', async () => {
    const spawnMock = createFakeSpawn(new Map([['docker', { stdout: '', stderr: 'bad output', exitCode: 1 }]]));

    const checker = new LocalHostToolChecker(spawnMock as unknown as typeof Bun.spawn);
    const result = await checker.check('docker');

    expect(result.status).toBe('found');
    expect(result.version).toBeNull();
  });

  it('ssh -V captured via script → normalized version', async () => {
    // script wraps ssh -V and captures tty output to stdout
    // Adapter normalizes: "OpenSSH_9.0p1 Debian-4, OpenSSL 3.0.0" → "9.0p1"
    const spawnMock = createFakeSpawn(
      new Map([['/usr/bin/script', { stdout: 'OpenSSH_9.0p1 Debian-4, OpenSSL 3.0.0', stderr: '', exitCode: 0 }]])
    );

    const checker = new LocalHostToolChecker(spawnMock as unknown as typeof Bun.spawn);
    const result = await checker.check('ssh');

    expect(result.status).toBe('found');
    expect(result.version).toBe('9.0p1');
  });

  it('git --version → normalized version', async () => {
    // Adapter normalizes: "git version 2.43.0" → "2.43.0"
    const spawnMock = createFakeSpawn(new Map([['git', { stdout: 'git version 2.43.0', stderr: '', exitCode: 0 }]]));

    const checker = new LocalHostToolChecker(spawnMock as unknown as typeof Bun.spawn);
    const result = await checker.check('git');

    expect(result.status).toBe('found');
    expect(result.version).toBe('2.43.0');
  });

  it('ssl → extracts version from ssh -V output', async () => {
    // ssl normalizes: extracts "3.0.0beta2" from the ssh raw output
    const spawnMock = createFakeSpawn(
      new Map([['/usr/bin/script', { stdout: 'OpenSSH_9.0p1, OpenSSL 3.0.0beta2', stderr: '', exitCode: 0 }]])
    );

    const checker = new LocalHostToolChecker(spawnMock as unknown as typeof Bun.spawn);
    const result = await checker.check('ssl');

    expect(result.status).toBe('found');
    expect(result.tool).toBe('ssl');
    expect(result.version).toBe('3.0.0beta2');
  });

  it('constructs without an injected spawn without touching the Bun global', () => {
    // Regression: the Bun.spawn default used to evaluate at construction,
    // throwing "Bun is not defined" under node/vitest. The default now
    // resolves lazily at spawn-call time (production runs under bun).
    expect(() => new LocalHostToolChecker()).not.toThrow();
  });
});
