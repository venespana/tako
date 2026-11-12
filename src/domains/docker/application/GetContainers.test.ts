// GetContainers.test.ts — use case outcome mapping (iteration 2 of
// tui-remote-home-screen)
//
// Remote failures are DATA: non-zero exits, signal kills and malformed
// `docker ps -a` output all map to refusal objects — an expected outcome
// never throws.
import { describe, expect, it } from 'vitest';

import { GetContainers } from './GetContainers.js';
import type { DockerContainersReader } from './GetContainers.js';
import type { CommandExecution } from '../domain/types.js';

const readerReturning = (execution: CommandExecution): DockerContainersReader => ({
  read: async () => execution,
});

const OK_PS = `{"ID":"abc123","Names":"web-1","State":"running","Labels":"com.docker.compose.project=media"}\n`;

describe('GetContainers — ok outcomes', () => {
  it('returns parsed containers on a successful read', async () => {
    const result = await new GetContainers(readerReturning({ exitCode: 0, stdout: OK_PS, stderr: '' })).execute();

    expect(result).toEqual({
      kind: 'ok',
      containers: [{ id: 'abc123', name: 'web-1', state: 'running', composeProject: 'media', health: null }],
    });
  });

  it('maps a successful but empty listing to an empty container list', async () => {
    const result = await new GetContainers(readerReturning({ exitCode: 0, stdout: '', stderr: '' })).execute();

    expect(result).toEqual({ kind: 'ok', containers: [] });
  });
});

describe('GetContainers — refusals are data, never throws', () => {
  it('refuses a non-zero exit carrying the remote stderr', async () => {
    const execution = {
      exitCode: 1,
      stdout: '',
      stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock\n',
    };
    const result = await new GetContainers(readerReturning(execution)).execute();

    expect(result).toEqual({
      kind: 'refusal',
      reason: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock',
    });
  });

  it('refuses a non-zero exit with empty stderr naming the exit code', async () => {
    const result = await new GetContainers(readerReturning({ exitCode: 127, stdout: '', stderr: '' })).execute();

    expect(result).toEqual({ kind: 'refusal', reason: 'docker ps exited with code 127' });
  });

  it('refuses a signal-killed command (exit code null)', async () => {
    const result = await new GetContainers(readerReturning({ exitCode: null, stdout: '', stderr: '' })).execute();

    expect(result).toEqual({ kind: 'refusal', reason: 'docker ps was terminated by a signal' });
  });

  it('refuses malformed JSON output through the strict parser', async () => {
    const result = await new GetContainers(readerReturning({ exitCode: 0, stdout: 'not json', stderr: '' })).execute();

    expect(result.kind).toBe('refusal');
  });

  it('prefers the remote stderr over the generic exit-code reason', async () => {
    const execution = { exitCode: 125, stdout: 'partial', stderr: 'permission denied on docker.sock' };
    const result = await new GetContainers(readerReturning(execution)).execute();

    expect(result).toEqual({ kind: 'refusal', reason: 'permission denied on docker.sock' });
  });
});

describe('GetContainers — port discipline', () => {
  it('reads exactly once through the injected port', async () => {
    let reads = 0;
    const reader: DockerContainersReader = {
      read: async () => {
        reads += 1;

        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };
    await new GetContainers(reader).execute();

    expect(reads).toBe(1);
  });
});
