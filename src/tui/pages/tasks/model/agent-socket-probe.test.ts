// pages/tasks/model/agent-socket-probe.test.ts — 9.17 connect
// guard: a missing agent socket is the EXPECTED pre-install state and must
// fail the connect with the TYPED friendly error (the install panel consumes
// it), never the raw channel-open failure; real transport failures keep
// their own messages.
import { describe, expect, it, vi } from 'vitest';

import type {
  RemoteCommandResult,
  RemoteCommandRunner,
} from '../../../../domains/remotes/application/RemoteCommandRunner.js';
import { AgentNotInstalledError, assertAgentSocketPresent, resolveAgentSocketPath } from './agent-socket-probe.js';

const ok = (stdout = ''): RemoteCommandResult => ({ stdout, stderr: '', exitCode: 0 });

function createRunner(impl: (command: string) => RemoteCommandResult): {
  runner: RemoteCommandRunner;
  commands: string[];
} {
  const commands: string[] = [];
  const runner: RemoteCommandRunner = {
    run: vi.fn(async (command: string) => {
      commands.push(command);
      return impl(command);
    }),
  };
  return { runner, commands };
}

describe('assertAgentSocketPresent — 9.17 connect guard', () => {
  it('missing socket → the TYPED friendly error naming the remote and the install panel', async () => {
    const { runner } = createRunner(command =>
      command.startsWith('test -S') ? { stdout: '', stderr: '', exitCode: 1 } : ok('/home/ops')
    );

    const error = await assertAgentSocketPresent(runner, 'nas').then(
      () => {
        throw new Error('expected assertAgentSocketPresent to reject');
      },
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AgentNotInstalledError);
    expect((error as Error).message).toBe('agent not installed on nas — the install panel will set it up');
  });

  it('probes the RESOLVED absolute socket path (home via exec — no tilde assumptions)', async () => {
    const { runner, commands } = createRunner(command => (command.startsWith('test -S') ? ok() : ok('/home/ops')));

    await expect(assertAgentSocketPresent(runner, 'nas')).resolves.toBeUndefined();

    expect(commands).toEqual(['printf %s "$HOME"', "test -S '/home/ops/.tako/agent.sock'"]);
  });

  it('OTHER transport failures keep their own message (never relabeled as not-installed)', async () => {
    const { runner } = createRunner(() => {
      throw new Error('(SSH) Channel open failure: open failed');
    });

    const error = await assertAgentSocketPresent(runner, 'nas').then(
      () => {
        throw new Error('expected assertAgentSocketPresent to reject');
      },
      (e: unknown) => e
    );

    expect(error).not.toBeInstanceOf(AgentNotInstalledError);
    expect((error as Error).message).toBe('(SSH) Channel open failure: open failed');
  });

  it('an unresolvable remote home fails explicitly (never misread as not-installed)', async () => {
    const { runner } = createRunner(() => ok(''));

    const error = await assertAgentSocketPresent(runner, 'nas').then(
      () => {
        throw new Error('expected assertAgentSocketPresent to reject');
      },
      (e: unknown) => e
    );

    expect(error).not.toBeInstanceOf(AgentNotInstalledError);
    expect((error as Error).message).toMatch(/cannot resolve the remote home directory/);
  });
});

describe('resolveAgentSocketPath', () => {
  it('joins the remote home with the default agent socket path', () => {
    expect(resolveAgentSocketPath('/home/ops')).toBe('/home/ops/.tako/agent.sock');
  });
});
