// infrastructure/SftpRemoteFileTransfer.test.ts — STRICT TDD RED phase
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SFTPWrapper } from 'ssh2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// RED: import the port and adapter that don't exist yet
import { SftpRemoteFileTransfer } from './SftpRemoteFileTransfer.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../application/RemoteCommandRunner.js';
import { TransferIntegrityError } from '../application/RemoteFileTransfer.js';

interface FakeSftp {
  fastPut: ReturnType<typeof vi.fn>;
  fastGet: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

function sha256Hex(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('SftpRemoteFileTransfer', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'tako-xfer-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function createFakeSftp(transfer: (kind: 'put' | 'get', from: string, to: string) => Promise<void>): FakeSftp {
    // Real SFTPWrapper methods are errback-style — the fake must invoke the callback.
    return {
      fastPut: vi.fn((local: string, remote: string, cb: (err?: Error) => void) => {
        transfer('put', local, remote).then(() => cb(), cb);
      }),
      fastGet: vi.fn((remote: string, local: string, cb: (err?: Error) => void) => {
        transfer('get', remote, local).then(() => cb(), cb);
      }),
      end: vi.fn(),
    };
  }

  function createRunnerFake(
    remotePath: () => string,
    overrides?: Partial<RemoteCommandResult>
  ): {
    runner: RemoteCommandRunner;
    run: ReturnType<typeof vi.fn>;
  } {
    const run = vi.fn(async (): Promise<RemoteCommandResult> => {
      const remote = remotePath();
      const bytes = await readFile(remote);
      return {
        stdout: `${sha256Hex(bytes)}  ${remote}\n`,
        stderr: '',
        exitCode: 0,
        ...overrides,
      };
    });
    return { runner: { run }, run };
  }

  function createTransfer(fakeSftp: FakeSftp, runner: RemoteCommandRunner): SftpRemoteFileTransfer {
    return new SftpRemoteFileTransfer(async () => fakeSftp as unknown as SFTPWrapper, runner);
  }

  it('2.6 RED: upload verifies the remote checksum and returns bytes plus sha256', async () => {
    const localPath = join(workDir, 'payload.bin');
    const remotePath = join(workDir, 'remote-payload.bin');
    const content = 'hello transfer\n';
    await writeFile(localPath, content);

    const fakeSftp = createFakeSftp((_kind, from, to) => copyFile(from, to));
    const { runner, run } = createRunnerFake(() => remotePath);
    const transfer = createTransfer(fakeSftp, runner);

    const result = await transfer.upload({ localPath, remotePath });

    const size = (await stat(localPath)).size;
    expect(result).toEqual({ bytes: size, sha256: sha256Hex(content) });
    expect(fakeSftp.fastPut).toHaveBeenCalledWith(localPath, remotePath, expect.any(Function));
    expect(fakeSftp.end).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(`sha256sum '${remotePath}'`);
  });

  it('2.6 RED: upload throws TransferIntegrityError when remote bytes differ', async () => {
    const localPath = join(workDir, 'payload.bin');
    const remotePath = join(workDir, 'remote-payload.bin');
    await writeFile(localPath, 'pristine content\n');

    const fakeSftp = createFakeSftp(async (_kind, _from, to) => {
      // Simulate a corrupted transfer: remote bytes diverge from local.
      await writeFile(to, 'corrupted content\n');
    });
    const { runner } = createRunnerFake(() => remotePath);
    const transfer = createTransfer(fakeSftp, runner);

    await expect(transfer.upload({ localPath, remotePath })).rejects.toThrow(TransferIntegrityError);
  });

  it('2.6 RED: upload throws TransferIntegrityError when the remote checksum command fails', async () => {
    const localPath = join(workDir, 'payload.bin');
    const remotePath = join(workDir, 'remote-payload.bin');
    await writeFile(localPath, 'hello transfer\n');

    const fakeSftp = createFakeSftp((_kind, from, to) => copyFile(from, to));
    const run = vi.fn(async (): Promise<RemoteCommandResult> => ({
      stdout: '',
      stderr: 'sha256sum: remote-payload.bin: No such file or directory\n',
      exitCode: 1,
    }));
    const transfer = createTransfer(fakeSftp, { run });

    await expect(transfer.upload({ localPath, remotePath })).rejects.toThrow('No such file or directory');
    expect(fakeSftp.end).toHaveBeenCalledTimes(1);
  });

  it('2.6 RED: download verifies the checksum and writes the local file', async () => {
    const remotePath = join(workDir, 'remote-payload.bin');
    const localPath = join(workDir, 'downloaded.bin');
    const content = 'agent binary bytes\n';
    await writeFile(remotePath, content);

    const fakeSftp = createFakeSftp((_kind, from, to) => copyFile(from, to));
    const { runner } = createRunnerFake(() => remotePath);
    const transfer = createTransfer(fakeSftp, runner);

    const result = await transfer.download({ remotePath, localPath });

    const size = (await stat(remotePath)).size;
    expect(result).toEqual({ bytes: size, sha256: sha256Hex(content) });
    expect(await readFile(localPath, 'utf8')).toBe(content);
    expect(fakeSftp.fastGet).toHaveBeenCalledWith(remotePath, localPath, expect.any(Function));
    expect(fakeSftp.end).toHaveBeenCalledTimes(1);
  });

  it('2.6 RED: download throws TransferIntegrityError when local bytes differ from remote', async () => {
    const remotePath = join(workDir, 'remote-payload.bin');
    const localPath = join(workDir, 'downloaded.bin');
    await writeFile(remotePath, 'agent binary bytes\n');

    const fakeSftp = createFakeSftp(async (_kind, _from, to) => {
      // Simulate a corrupted download landing locally.
      await writeFile(to, 'tampered bytes\n');
    });
    const { runner } = createRunnerFake(() => remotePath);
    const transfer = createTransfer(fakeSftp, runner);

    await expect(transfer.download({ remotePath, localPath })).rejects.toThrow(TransferIntegrityError);
  });

  it('2.6 RED: single-quotes remote paths in the checksum command so metacharacters stay inert', async () => {
    const localPath = join(workDir, 'payload.bin');
    const hostilePath = "/home/ops/my stack/payload'; reboot.bin";
    const content = 'content\n';
    await writeFile(localPath, content);

    const fakeSftp = createFakeSftp(async () => {
      // The hostile remote path is never materialized — this test pins the command string only.
    });
    const run = vi.fn(async (): Promise<RemoteCommandResult> => ({
      stdout: `${sha256Hex(content)}  ${hostilePath}\n`,
      stderr: '',
      exitCode: 0,
    }));
    const transfer = createTransfer(fakeSftp, { run });

    await transfer.upload({ localPath, remotePath: hostilePath });

    expect(run).toHaveBeenCalledWith(`sha256sum '${hostilePath.replaceAll("'", `'\\''`)}'`);
  });
});
