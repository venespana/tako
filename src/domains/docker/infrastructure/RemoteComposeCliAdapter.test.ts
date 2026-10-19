// RemoteComposeCliAdapter.test.ts — ComposeStatusReader over RemoteCommandRunner (S3)
//
// The adapter is a thin translation layer: ONE fixed remote command, and a
// field-for-field mapping of RemoteCommandResult into the docker domain's
// CommandExecution. The runner is injected — nothing here opens SSH.
import { describe, expect, it, vi } from 'vitest';

import { COMPOSE_LS_COMMAND, RemoteComposeCliAdapter } from './RemoteComposeCliAdapter.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import { GetStackStatus } from '../application/GetStackStatus.js';

function fakeRunner(result: RemoteCommandResult): { runner: RemoteCommandRunner; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async () => result);

  return { run, runner: { run } as RemoteCommandRunner };
}

const FIXTURE = '[{"Name":"nas","Status":"running(3)","ConfigFiles":"/opt/nas/compose.yml"}]';

describe('RemoteComposeCliAdapter — command discipline', () => {
  it('runs the exact fixed compose ls command, once per read', async () => {
    const { run, runner } = fakeRunner({ exitCode: 0, stdout: FIXTURE, stderr: '' });

    await new RemoteComposeCliAdapter(runner).read();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(COMPOSE_LS_COMMAND);
    expect(COMPOSE_LS_COMMAND).toBe('docker compose ls --format json');
  });

  it('maps the result fields into CommandExecution untouched', async () => {
    const { runner } = fakeRunner({ exitCode: 0, stdout: FIXTURE, stderr: 'warn-line\n' });
    const execution = await new RemoteComposeCliAdapter(runner).read();

    expect(execution).toEqual({ exitCode: 0, stdout: FIXTURE, stderr: 'warn-line\n' });
  });
});

describe('RemoteComposeCliAdapter — composition with GetStackStatus', () => {
  it('yields parsed entries through the real use case', async () => {
    const { runner } = fakeRunner({ exitCode: 0, stdout: FIXTURE, stderr: '' });
    const result = await new GetStackStatus(new RemoteComposeCliAdapter(runner)).execute();

    expect(result).toEqual({
      kind: 'ok',
      entries: [{ name: 'nas', status: 'running(3)', configFiles: '/opt/nas/compose.yml' }],
    });
  });

  it('turns a missing docker binary (exit 127) into a refusal', async () => {
    const { runner } = fakeRunner({ exitCode: 127, stdout: '', stderr: 'sh: docker: not found\n' });
    const result = await new GetStackStatus(new RemoteComposeCliAdapter(runner)).execute();

    expect(result).toEqual({ kind: 'refusal', reason: 'sh: docker: not found' });
  });
});
