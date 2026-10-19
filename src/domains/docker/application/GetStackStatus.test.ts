// GetStackStatus.test.ts — use case outcome mapping (S2 of mvp-status-command)
//
// Remote failures are DATA: non-zero exits, signal kills and malformed
// `docker compose ls --format json` output all map to refusal objects —
// an expected outcome never throws.
import { describe, expect, it } from 'vitest';

import { GetStackStatus } from './GetStackStatus.js';
import type { ComposeStatusReader } from './GetStackStatus.js';
import type { CommandExecution } from '../domain/types.js';

const readerReturning = (execution: CommandExecution): ComposeStatusReader => ({
  read: async () => execution,
});

const OK_LS = '[{"Name":"reverse-proxy","Status":"running(2)","ConfigFiles":"/srv/reverse-proxy/docker-compose.yml"}]';

describe('GetStackStatus — ok outcomes', () => {
  it('returns parsed entries on a successful read', async () => {
    const result = await new GetStackStatus(readerReturning({ exitCode: 0, stdout: OK_LS, stderr: '' })).execute();

    expect(result).toEqual({
      kind: 'ok',
      entries: [{ name: 'reverse-proxy', status: 'running(2)', configFiles: '/srv/reverse-proxy/docker-compose.yml' }],
    });
  });

  it('maps a successful but empty listing to an empty entry list', async () => {
    const result = await new GetStackStatus(readerReturning({ exitCode: 0, stdout: '[]\n', stderr: '' })).execute();

    expect(result).toEqual({ kind: 'ok', entries: [] });
  });
});

describe('GetStackStatus — refusals are data, never throws', () => {
  it('refuses a non-zero exit carrying the remote stderr', async () => {
    const execution = { exitCode: 1, stdout: '', stderr: "docker: 'compose' is not a docker command.\n" };
    const result = await new GetStackStatus(readerReturning(execution)).execute();

    expect(result).toEqual({ kind: 'refusal', reason: "docker: 'compose' is not a docker command." });
  });

  it('refuses a non-zero exit with empty stderr naming the exit code', async () => {
    const result = await new GetStackStatus(readerReturning({ exitCode: 127, stdout: '', stderr: '' })).execute();

    expect(result).toEqual({ kind: 'refusal', reason: 'docker compose ls exited with code 127' });
  });

  it('refuses a signal-killed command (exit code null)', async () => {
    const result = await new GetStackStatus(readerReturning({ exitCode: null, stdout: '', stderr: '' })).execute();

    expect(result).toEqual({ kind: 'refusal', reason: 'docker compose ls was terminated by a signal' });
  });

  it('refuses malformed JSON output through the strict parser', async () => {
    const result = await new GetStackStatus(readerReturning({ exitCode: 0, stdout: 'not json', stderr: '' })).execute();

    expect(result.kind).toBe('refusal');
  });

  it('prefers the remote stderr over the generic exit-code reason', async () => {
    const execution = { exitCode: 125, stdout: 'partial', stderr: 'cannot connect to the Docker daemon' };
    const result = await new GetStackStatus(readerReturning(execution)).execute();

    expect(result).toEqual({ kind: 'refusal', reason: 'cannot connect to the Docker daemon' });
  });
});

describe('GetStackStatus — port discipline', () => {
  it('reads exactly once through the injected port', async () => {
    let reads = 0;
    const reader: ComposeStatusReader = {
      read: async () => {
        reads += 1;

        return { exitCode: 0, stdout: '[]', stderr: '' };
      },
    };
    await new GetStackStatus(reader).execute();

    expect(reads).toBe(1);
  });
});
