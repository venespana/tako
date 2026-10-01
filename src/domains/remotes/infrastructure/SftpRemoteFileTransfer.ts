// SftpRemoteFileTransfer.ts — INFRASTRUCTURE adapter (sole ssh2 consumer)
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import type { SFTPWrapper } from 'ssh2';

import type { RemoteCommandRunner } from '../application/RemoteCommandRunner.js';
import type {
  RemoteDownloadRequest,
  RemoteFileTransfer,
  RemoteTransferResult,
  RemoteUploadRequest,
} from '../application/RemoteFileTransfer.js';
import { TransferIntegrityError } from '../application/RemoteFileTransfer.js';

export class SftpRemoteFileTransfer implements RemoteFileTransfer {
  constructor(
    private readonly openSftp: () => Promise<SFTPWrapper>,
    private readonly runner: RemoteCommandRunner
  ) {}

  async upload(request: RemoteUploadRequest): Promise<RemoteTransferResult> {
    const sftp = await this.openSftp();
    try {
      const [localSha, size] = await Promise.all([sha256File(request.localPath), fileSize(request.localPath)]);
      await fastPut(sftp, request.localPath, request.remotePath);
      const remoteSha = await this.remoteSha256(request.remotePath);
      assertIntegrity('upload', localSha, remoteSha, request.remotePath);
      return { bytes: size, sha256: localSha };
    } finally {
      sftp.end();
    }
  }

  async download(request: RemoteDownloadRequest): Promise<RemoteTransferResult> {
    const sftp = await this.openSftp();
    try {
      const remoteSha = await this.remoteSha256(request.remotePath);
      await fastGet(sftp, request.remotePath, request.localPath);
      const [localSha, size] = await Promise.all([sha256File(request.localPath), fileSize(request.localPath)]);
      assertIntegrity('download', localSha, remoteSha, request.remotePath);
      return { bytes: size, sha256: localSha };
    } finally {
      sftp.end();
    }
  }

  private async remoteSha256(remotePath: string): Promise<string> {
    const result = await this.runner.run(`sha256sum ${shellQuote(remotePath)}`);
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || `exit code ${result.exitCode}`;
      throw new TransferIntegrityError(`Remote checksum verification failed for ${remotePath}: ${detail}`);
    }
    const match = /^([0-9a-f]{64})\b/.exec(result.stdout);
    const hash = match?.[1];
    if (!hash) {
      throw new TransferIntegrityError(`Unreadable sha256 output for ${remotePath}: ${result.stdout.trim()}`);
    }
    return hash;
  }
}

function assertIntegrity(
  direction: 'upload' | 'download',
  localSha: string,
  remoteSha: string,
  remotePath: string
): void {
  if (localSha !== remoteSha) {
    throw new TransferIntegrityError(
      `${direction}: remote bytes at ${remotePath} do not match the local checksum (expected ${localSha}, got ${remoteSha})`
    );
  }
}

/** Single-quote a path for remote shell consumption; embedded quotes become the `'\''` escape. */
function shellQuote(path: string): string {
  return `'${path.replaceAll("'", `'\\''`)}'`;
}

function fastPut(sftp: SFTPWrapper, localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, err => (err ? reject(err) : resolve()));
  });
}

function fastGet(sftp: SFTPWrapper, remotePath: string, localPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastGet(remotePath, localPath, err => (err ? reject(err) : resolve()));
  });
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function fileSize(path: string): Promise<number> {
  const stats = await stat(path);
  return stats.size;
}
