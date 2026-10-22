// LocalHostToolChecker.integ.test.ts — Integration test (GREEN)
// Vitest runs on Node, where the Bun global is absent, so the checker's
// default Bun.spawn binding cannot be constructed here. Production stays
// Bun-first (sole Bun.spawn consumer); this test injects a
// node:child_process adapter exposing the same Subprocess-shaped contract
// (exited / stdout.text / stderr.text) the checker expects.
import { spawn } from 'node:child_process';

import { describe, it, expect } from 'vitest';

import { LocalHostToolChecker } from '../../../src/domains/system/infrastructure/LocalHostToolChecker.js';

interface SpawnedLike {
  exited: Promise<number>;
  stdout: { text(): Promise<string> };
  stderr: { text(): Promise<string> };
}

/** node:child_process adapter matching the Bun.spawn subset the checker uses. */
function nodeSpawn(args: readonly string[]): SpawnedLike {
  const proc = spawn(args[0]!, args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });

  const collect = (stream: NodeJS.ReadableStream | null): Promise<string> =>
    new Promise(resolve => {
      if (stream === null) {
        resolve('');
        return;
      }

      let out = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        out += chunk;
      });
      stream.on('end', () => resolve(out));
      stream.on('error', () => resolve(out));
    });

  // Reject on spawn errors (e.g. ENOENT) so the checker's catch sees the
  // same semantics Bun.spawn gives by throwing.
  const exited = new Promise<number>((resolve, reject) => {
    proc.on('error', error => reject(error));
    proc.on('exit', code => resolve(code ?? -1));
  });

  return {
    exited,
    stdout: { text: () => collect(proc.stdout) },
    stderr: { text: () => collect(proc.stderr) },
  };
}

describe('LocalHostToolChecker (integration)', () => {
  it('6.3 GREEN: real git on PATH → status:found, non-null version', async () => {
    const checker = new LocalHostToolChecker(nodeSpawn as unknown as typeof Bun.spawn);
    const result = await checker.check('git');

    expect(result.tool).toBe('git');
    expect(result.status).toBe('found');
    expect(result.version).not.toBeNull();
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/); // e.g. "2.55.0"
  });
});
