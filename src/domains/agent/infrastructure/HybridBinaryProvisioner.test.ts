// infrastructure/HybridBinaryProvisioner.test.ts — STRICT TDD RED phase
//
// Covers the distribution decision table (task 4.8) plus the deferred
// threat-matrix RED tests 3.13 (decoy-file refusal) and 3.15 (corrupted /
// missing-sha256 Releases asset explicit failure).
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BinarySource } from '../application/use-cases/InstallAgent.js';
import type {
  RemoteCommandResult,
  RemoteCommandRunner,
} from '../../remotes/application/RemoteCommandRunner.js';
import type {
  RemoteTransferResult,
  RemoteFileTransfer,
  RemoteUploadRequest,
} from '../../remotes/application/RemoteFileTransfer.js';
import { HybridBinaryProvisioner } from './HybridBinaryProvisioner.js';

const HOME = '/home/ops';
const TARGET = `${HOME}/.tako/tako`;
const STAGING = `${TARGET}.new`;

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Command-routing fake: maps probe/verify/mutation commands to canned results. */
class FakeRunner implements RemoteCommandRunner {
  readonly commands: string[] = [];
  readonly handlers = new Map<string, () => RemoteCommandResult>();

  register(token: string, result: Partial<RemoteCommandResult>): void {
    this.handlers.set(token, () => ({
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
    }));
  }

  async run(command: string): Promise<RemoteCommandResult> {
    this.commands.push(command);
    for (const [token, handler] of this.handlers) {
      if (command.includes(token)) return handler();
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  ran(token: string): boolean {
    return this.commands.some(command => command.includes(token));
  }
}

class FakeTransfer implements RemoteFileTransfer {
  readonly uploads: RemoteUploadRequest[] = [];

  async upload(request: RemoteUploadRequest): Promise<RemoteTransferResult> {
    this.uploads.push(request);
    return { bytes: 10, sha256: 'faux-upload-sha' };
  }

  async download(): Promise<RemoteTransferResult> {
    throw new Error('download not used by v0 flows');
  }
}

interface Harness {
  runner: FakeRunner;
  transfer: FakeTransfer;
  provisioner: HybridBinaryProvisioner;
  localBinary: string;
  localSha: string;
}

function createHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'tako-provisioner-'));
  const localBinary = join(dir, 'tako-client');
  writeFileSync(localBinary, 'tako-binary-bytes');
  const runner = new FakeRunner();
  runner.register('printf %s "$HOME"', { stdout: HOME });
  runner.register('mkdir -p', { stdout: '' });
  const transfer = new FakeTransfer();
  const provisioner = new HybridBinaryProvisioner(runner, transfer);
  return { runner, transfer, provisioner, localBinary, localSha: sha256File(localBinary) };
}

const copySource: BinarySource = { kind: 'copy-local-binary' };

function downloadSource(): BinarySource {
  return { kind: 'download-release-asset', asset: 'tako-linux-arm64' };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HybridBinaryProvisioner — copy path (arch match)', () => {
  it('uploads to tako.new, verifies the remote sha256, then moves atomically with chmod 700', async () => {
    const { runner, transfer, provisioner, localBinary, localSha } = createHarness();
    runner.register(`sha256sum '${STAGING}'`, { stdout: `${localSha}  ${STAGING}` });
    runner.register(`sha256sum '${TARGET}' 2>/dev/null`, { exitCode: 1 });

    const result = await provisioner.provision({
      source: copySource,
      version: '0.1.2',
      localBinaryPath: localBinary,
      clientSha256: localSha,
    });

    expect(transfer.uploads).toHaveLength(1);
    expect(transfer.uploads[0]?.remotePath).toBe(STAGING);
    expect(result.remotePath).toBe(TARGET);
    expect(result.sha256).toBe(localSha);
    const moveCommand = runner.commands.find(command => command.includes('mv '));
    expect(moveCommand).toContain(`mv -f '${STAGING}' '${TARGET}'`);
    expect(moveCommand).toContain('chmod 700');
  });

  it('refuses the copy path when the uploaded bytes fail the remote sha256 check', async () => {
    const { runner, provisioner, localBinary, localSha } = createHarness();
    runner.register(`sha256sum '${STAGING}'`, { stdout: `deadbeef  ${STAGING}` });

    await expect(
      provisioner.provision({
        source: copySource,
        version: '0.1.2',
        localBinaryPath: localBinary,
        clientSha256: localSha,
      })
    ).rejects.toThrow(/sha256 mismatch/i);
    expect(runner.ran('mv -f')).toBe(false);
  });
});

describe('HybridBinaryProvisioner — 3.13 decoy-file refusal', () => {
  it('3.13 RED: refuses to overwrite a pre-existing non-Tako ~/.tako/tako whose sha matches neither prior install nor the new binary', async () => {
    const { runner, provisioner, localBinary, localSha } = createHarness();
    // A decoy already sits at the target and matches nothing we know.
    runner.register(`sha256sum '${TARGET}' 2>/dev/null`, { stdout: `${'d'.repeat(64)}  ${TARGET}` });
    runner.register(`sha256sum '${STAGING}'`, { stdout: `${localSha}  ${STAGING}` });

    await expect(
      provisioner.provision({
        source: copySource,
        version: '0.1.2',
        localBinaryPath: localBinary,
        clientSha256: localSha,
      })
    ).rejects.toThrow(new RegExp(`refusing to overwrite ${TARGET.replace(/\//g, '\\/')}`));

    expect(runner.ran('mv -f')).toBe(false);
    expect(runner.ran('chmod 700')).toBe(false);
  });

  it('3.13: replaces a pre-existing file when its sha256 matches the recorded prior install', async () => {
    const { runner, provisioner, localBinary, localSha } = createHarness();
    const priorSha = 'aaaa'.repeat(16);
    runner.register(`sha256sum '${TARGET}' 2>/dev/null`, { stdout: `${priorSha}  ${TARGET}` });
    runner.register(`sha256sum '${STAGING}'`, { stdout: `${localSha}  ${STAGING}` });

    const result = await provisioner.provision({
      source: copySource,
      version: '0.1.2',
      localBinaryPath: localBinary,
      clientSha256: localSha,
      priorInstallSha256: priorSha,
    });

    expect(result.remotePath).toBe(TARGET);
    expect(runner.ran('mv -f')).toBe(true);
  });

  it('3.13: replaces silently when the existing file already matches the new binary (reinstall)', async () => {
    const { runner, provisioner, localBinary, localSha } = createHarness();
    runner.register(`sha256sum '${TARGET}' 2>/dev/null`, { stdout: `${localSha}  ${TARGET}` });
    runner.register(`sha256sum '${STAGING}'`, { stdout: `${localSha}  ${STAGING}` });

    await expect(
      provisioner.provision({
        source: copySource,
        version: '0.1.2',
        localBinaryPath: localBinary,
        clientSha256: localSha,
      })
    ).resolves.toMatchObject({ remotePath: TARGET });
  });
});

describe('HybridBinaryProvisioner — Releases download fallback (arch mismatch)', () => {
  function registerDownload(runner: FakeRunner, assetSha: string, sidecar: string): void {
    const assetPath = STAGING;
    const sidecarPath = `${STAGING}.sha256`;
    runner.register(`curl -fsSL 'https://github.com/venespana/tako/releases/download/v0.1.2/tako-linux-arm64' -o`, {
      exitCode: 0,
    });
    runner.register(`curl -fsSL 'https://github.com/venespana/tako/releases/download/v0.1.2/tako-linux-arm64.sha256' -o`, {
      exitCode: 0,
    });
    runner.register(`cat '${sidecarPath}'`, { stdout: `${sidecar}  tako-linux-arm64` });
    runner.register(`sha256sum '${assetPath}'`, { stdout: `${assetSha}  ${assetPath}` });
  }

  it('downloads the per-arch asset, verifies it against the .sha256 sidecar, then installs atomically', async () => {
    const { runner, provisioner } = createHarness();
    const assetSha = 'bbbb'.repeat(16);
    registerDownload(runner, assetSha, assetSha);
    runner.register(`sha256sum '${TARGET}' 2>/dev/null`, { exitCode: 1 });

    const result = await provisioner.provision({ source: downloadSource(), version: '0.1.2' });

    expect(result.sha256).toBe(assetSha);
    expect(runner.ran(`mv -f '${STAGING}' '${TARGET}'`)).toBe(true);
  });

  it('3.15 RED: fails explicitly when the downloaded asset is corrupted (sha mismatches the sidecar), naming arch and attempted paths', async () => {
    const { runner, provisioner } = createHarness();
    registerDownload(runner, 'bbbb'.repeat(16), 'cccc'.repeat(16));

    const failure = provisioner.provision({ source: downloadSource(), version: '0.1.2' });

    await expect(failure).rejects.toThrow(/tako-linux-arm64/);
    await expect(failure).rejects.toThrow(/checksum/i);
    await expect(failure).rejects.toThrow(/\.tako\/tako\.new/);
    expect(runner.ran('mv -f')).toBe(false);
  });

  it('3.15 RED: fails explicitly when the .sha256 sidecar is missing (no egress or 404), naming the attempted path', async () => {
    const { runner, provisioner } = createHarness();
    runner.register(
      `curl -fsSL 'https://github.com/venespana/tako/releases/download/v0.1.2/tako-linux-arm64' -o`,
      { exitCode: 0 }
    );
    runner.register(
      `curl -fsSL 'https://github.com/venespana/tako/releases/download/v0.1.2/tako-linux-arm64.sha256' -o`,
      { exitCode: 22, stderr: 'curl: (22) The requested URL returned error: 404' }
    );

    const failure = provisioner.provision({ source: downloadSource(), version: '0.1.2' });

    await expect(failure).rejects.toThrow(/sha256 sidecar/i);
    await expect(failure).rejects.toThrow(/tako-linux-arm64\.sha256/);
    expect(runner.ran('mv -f')).toBe(false);
  });

  it('fails explicitly when the asset itself cannot be downloaded, naming arch and attempted paths', async () => {
    const { runner, provisioner } = createHarness();
    runner.register(
      `curl -fsSL 'https://github.com/venespana/tako/releases/download/v0.1.2/tako-linux-arm64' -o`,
      { exitCode: 28, stderr: 'curl: (28) Connection timed out' }
    );

    await expect(provisioner.provision({ source: downloadSource(), version: '0.1.2' })).rejects.toThrow(
      /tako-linux-arm64/
    );
  });

  it('3.13+download: applies the same decoy guard to a downloaded asset', async () => {
    const { runner, provisioner } = createHarness();
    const assetSha = 'bbbb'.repeat(16);
    registerDownload(runner, assetSha, assetSha);
    runner.register(`sha256sum '${TARGET}' 2>/dev/null`, { stdout: `${'d'.repeat(64)}  ${TARGET}` });

    await expect(provisioner.provision({ source: downloadSource(), version: '0.1.2' })).rejects.toThrow(
      /refusing to overwrite/
    );
  });
});

describe('HybridBinaryProvisioner — remote home resolution', () => {
  it('resolves the remote home via exec because sftp-server does not expand tilde (task 6.8 note)', async () => {
    const { runner, transfer, provisioner, localBinary, localSha } = createHarness();
    runner.register(`sha256sum '${STAGING}'`, { stdout: `${localSha}  ${STAGING}` });

    await provisioner.provision({
      source: copySource,
      version: '0.1.2',
      localBinaryPath: localBinary,
      clientSha256: localSha,
    });

    expect(runner.commands[0]).toBe('printf %s "$HOME"');
    expect(transfer.uploads[0]?.remotePath).toBe('/home/ops/.tako/tako.new');
  });
});
