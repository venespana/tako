// ComposeCliAdapter.test.ts — argv (never shell) execution over real child processes (tasks 5.5, 5.7)
//
// The adapter is the ONLY place that spawns `docker compose`. These tests
// prove the execution contract with real processes: argv arrives verbatim
// (a `|` argument survives — no shell interpretation), cwd is honored,
// stdout/stderr/exit are captured, and a signal kill yields a null exit.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { ComposeCliAdapter } from './ComposeCliAdapter.js';

const adapter = new ComposeCliAdapter();
let workDir: string;

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

/** argv for a node one-liner whose argv.slice(2) is the payload to print. */
function printArgvCommand(...payload: string[]) {
  return {
    argv: [process.execPath, '-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...payload],
    cwd: tmpdir(),
  };
}

describe('ComposeCliAdapter — argv execution (no shell)', () => {
  it('delivers every argv element verbatim, including shell metacharacters', async () => {
    const result = await adapter.run(printArgvCommand('compose', 'up', '-d', 'a|b', 'arg with spaces'));

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual(['compose', 'up', '-d', 'a|b', 'arg with spaces']);
  });

  it('runs in command.cwd', async () => {
    workDir = mkdtempSync(join(tmpdir(), 'tako-compose-'));
    const result = await adapter.run({
      argv: [process.execPath, '-e', 'process.stdout.write(process.cwd())'],
      cwd: workDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(workDir);
  });

  it('captures stdout, stderr and a non-zero exit as a result (not a throw)', async () => {
    const result = await adapter.run({
      argv: [process.execPath, '-e', 'console.log("out-line"); console.error("err-line"); process.exit(3)'],
      cwd: tmpdir(),
    });

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toContain('out-line');
    expect(result.stderr).toContain('err-line');
  });

  it('reports a null exit code when the child dies by signal', async () => {
    const result = await adapter.run({
      argv: [process.execPath, '-e', 'process.kill(process.pid, "SIGKILL")'],
      cwd: tmpdir(),
    });

    expect(result.exitCode).toBeNull();
  });

  it('rejects on spawn failure (binary missing) — a transport-style error', async () => {
    await expect(adapter.run({ argv: ['/nonexistent/tako-fake-bin', 'arg'], cwd: tmpdir() })).rejects.toThrow(
      /ENOENT/
    );
  });
});
