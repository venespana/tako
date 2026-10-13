// RunStackLifecycle.test.ts — lifecycle use case: op assembler, dry-run discipline, hostile stackDir (tasks 5.3, 5.7)
//
// The use case is the hostile-input boundary: untrusted op/stackDir/mode are
// validated in-domain BEFORE any command is assembled, and dry-run returns
// the exact command that WOULD run without ever touching the port.
import { describe, expect, it } from 'vitest';

import { RunStackLifecycle, StackLifecycleValidationError, composeLifecycleArgv } from './RunStackLifecycle.js';
import type { ComposeRunner } from './RunStackLifecycle.js';
import { StackDirValidationError } from '../domain/stack-dir.js';
import type { ComposeCommand, CommandExecution } from '../domain/types.js';

/** Recording fake: proves WHAT the use case ran — and what it did NOT. */
class RecordingRunner implements ComposeRunner {
  readonly calls: ComposeCommand[] = [];
  private readonly results: CommandExecution[];

  constructor(...results: CommandExecution[]) {
    this.results = results;
  }

  async run(command: ComposeCommand): Promise<CommandExecution> {
    this.calls.push(command);
    return this.results.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
  }
}

const STACK_DIR = '/opt/stacks/plex';

describe('composeLifecycleArgv — exact argv per op (no shell anywhere)', () => {
  it.each([
    ['up', ['docker', 'compose', 'up', '-d']],
    ['down', ['docker', 'compose', 'down']],
    ['pull', ['docker', 'compose', 'pull']],
    ['restart', ['docker', 'compose', 'restart']],
  ] as const)('%s → %j', (op, expected) => {
    expect(composeLifecycleArgv(op)).toEqual(expected);
  });
});

describe('RunStackLifecycle — dry-run mutates nothing (spec: report only)', () => {
  it('returns the exact would-run command and never calls the port', async () => {
    const runner = new RecordingRunner();
    const useCase = new RunStackLifecycle(runner);

    const report = await useCase.execute({ op: 'pull', stackDir: STACK_DIR, mode: 'dry-run' });

    expect(report).toEqual({
      mode: 'dry-run',
      op: 'pull',
      stackDir: STACK_DIR,
      command: { argv: ['docker', 'compose', 'pull'], cwd: STACK_DIR },
      status: 'planned',
    });
    expect('execution' in report).toBe(false);
    expect(runner.calls).toHaveLength(0);
  });

  it('dry-run of up carries the detached argv', async () => {
    const runner = new RecordingRunner();
    const report = await new RunStackLifecycle(runner).execute({ op: 'up', stackDir: STACK_DIR, mode: 'dry-run' });
    expect(report.command.argv).toEqual(['docker', 'compose', 'up', '-d']);
    expect(runner.calls).toHaveLength(0);
  });
});

describe('RunStackLifecycle — apply executes through the port', () => {
  it('runs the assembled command and reports success on exit 0', async () => {
    const runner = new RecordingRunner({ exitCode: 0, stdout: ' Pulled\n', stderr: '' });
    const report = await new RunStackLifecycle(runner).execute({ op: 'up', stackDir: STACK_DIR, mode: 'apply' });

    expect(runner.calls).toEqual([{ argv: ['docker', 'compose', 'up', '-d'], cwd: STACK_DIR }]);
    expect(report).toEqual({
      mode: 'apply',
      op: 'up',
      stackDir: STACK_DIR,
      command: { argv: ['docker', 'compose', 'up', '-d'], cwd: STACK_DIR },
      execution: { exitCode: 0, stdout: ' Pulled\n', stderr: '' },
      status: 'succeeded',
    });
  });

  it('reports failure (not a throw) when compose exits non-zero', async () => {
    const runner = new RecordingRunner({ exitCode: 1, stdout: '', stderr: 'no configuration file provided' });
    const report = await new RunStackLifecycle(runner).execute({ op: 'down', stackDir: STACK_DIR, mode: 'apply' });

    expect(report.status).toBe('failed');
    expect(report.execution).toEqual({ exitCode: 1, stdout: '', stderr: 'no configuration file provided' });
  });
});

describe('RunStackLifecycle — hostile input rejection before the port', () => {
  const hostileDirs: readonly unknown[] = ['nas;reboot', '$(whoami)', '-flag', 'a\nb', '', 42, null, undefined];

  it.each(hostileDirs)('rejects stackDir %j with the domain error and no port call', async dir => {
    const runner = new RecordingRunner();
    await expect(new RunStackLifecycle(runner).execute({ op: 'up', stackDir: dir, mode: 'dry-run' })).rejects.toThrow(
      StackDirValidationError
    );
    expect(runner.calls).toHaveLength(0);
  });

  it.each(['deploy', 'up -d', 42, null, undefined])('rejects op %j', async op => {
    const runner = new RecordingRunner();
    await expect(new RunStackLifecycle(runner).execute({ op, stackDir: STACK_DIR, mode: 'dry-run' })).rejects.toThrow(
      StackLifecycleValidationError
    );
    expect(runner.calls).toHaveLength(0);
  });

  it.each(['mutate', 'APPLY', 42, null, undefined])('rejects mode %j', async mode => {
    const runner = new RecordingRunner();
    await expect(new RunStackLifecycle(runner).execute({ op: 'up', stackDir: STACK_DIR, mode })).rejects.toThrow(
      StackLifecycleValidationError
    );
    expect(runner.calls).toHaveLength(0);
  });
});
