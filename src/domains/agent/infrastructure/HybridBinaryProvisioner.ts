// infrastructure/HybridBinaryProvisioner.ts — hybrid binary distribution (task 4.6)
//
// Copy path (arch match): SFTP-upload the running client binary to
// ~/.tako/tako.new, verify the remote sha256 against the local one, then
// atomic `mv` + `chmod 700`. The remote home is resolved via exec because
// sftp-server does NOT expand tilde (task 6.8 finding).
//
// Download path (arch mismatch): server-side `curl -fsSL` of the same-version
// per-arch Release asset (ADR-0017) + `.sha256` sidecar verification before
// the move. Any failure names the arch and the attempted paths (3.15).
//
// Threat matrix (executable placement): a pre-existing ~/.tako/tako is
// overwritten only when its sha256 matches the new binary (reinstall) or the
// recorded prior install (upgrade); anything else is a DECOY and the
// provisioner refuses, leaving the file untouched (3.13).
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

import type { RemoteCommandResult, RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import type { RemoteFileTransfer } from '../../remotes/application/RemoteFileTransfer.js';
import type { BinarySource } from '../application/use-cases/InstallAgent.js';

export const DEFAULT_RELEASE_BASE_URL = 'https://github.com/venespana/tako/releases/download';

/** Thrown when the binary cannot be placed safely; names arch + attempted paths. */
export class BinaryProvisioningError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BinaryProvisioningError';
  }
}

export interface ProvisionInput {
  /** Distribution decision from InstallAgent.decideBinarySource (pure, WU3). */
  readonly source: BinarySource;
  /** Client version used to pin the release asset URL (download path). */
  readonly version: string;
  /** Local binary to upload on the copy path; defaults to the running binary. */
  readonly localBinaryPath?: string;
  /** sha256 of the local binary (copy path) — the composition root computes it. */
  readonly clientSha256?: string;
  /** sha256 recorded by the previous install (agent_meta); undefined = first install. */
  readonly priorInstallSha256?: string;
  readonly releaseBaseUrl?: string;
}

export interface ProvisionResult {
  readonly remotePath: string;
  readonly sha256: string;
}

export interface HybridBinaryProvisionerOptions {
  /** GitHub owner/repo slug for the Releases fallback URL. */
  readonly releaseBaseUrl?: string;
}

/** Outcome of probing a remote file's sha256: missing vs failed are NOT the same (9.7). */
type RemoteShaProbe = { kind: 'sha'; sha: string } | { kind: 'missing' } | { kind: 'failed'; detail: string };

export class HybridBinaryProvisioner {
  readonly #runner: RemoteCommandRunner;
  readonly #transfer: RemoteFileTransfer;
  readonly #releaseBaseUrl: string;

  constructor(runner: RemoteCommandRunner, transfer: RemoteFileTransfer, options: HybridBinaryProvisionerOptions = {}) {
    this.#runner = runner;
    this.#transfer = transfer;
    this.#releaseBaseUrl = options.releaseBaseUrl ?? DEFAULT_RELEASE_BASE_URL;
  }

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    const home = await this.#remoteHome();
    const remoteDir = `${home}/.tako`;
    const target = `${remoteDir}/tako`;
    const staging = `${target}.new`;

    await this.#exec(`mkdir -p '${remoteDir}'`);

    const newSha =
      input.source.kind === 'copy-local-binary'
        ? await this.#provisionByCopy(input, staging, target)
        : await this.#provisionByDownload(input, staging, target);

    // Decoy guard BEFORE the move — a file we cannot account for is never
    // replaced, and a FAILED probe is never read as "absent" (that would
    // bypass the guard).
    const existing = await this.#remoteSha256(target);

    if (existing.kind === 'failed') {
      throw new BinaryProvisioningError(
        `refusing to proceed: could not hash the existing ${target} (${existing.detail}) — a file we cannot account for is never replaced; inspect it manually, then re-run install`
      );
    }

    if (existing.kind === 'sha' && !isSafeToReplace(existing.sha, newSha, input.priorInstallSha256)) {
      throw new BinaryProvisioningError(
        `refusing to overwrite ${target}: its sha256 (${existing.sha.slice(0, 12)}…) matches neither the new binary nor the prior install — the file may not be Tako's (decoy). Remove it manually or verify its origin, then re-run install`
      );
    }

    await this.#exec(`mv -f '${staging}' '${target}' && chmod 700 '${target}'`);
    // Best-effort sidecar cleanup on the download path.
    await this.#exec(`rm -f '${staging}.sha256'`);
    return { remotePath: target, sha256: newSha };
  }

  /** Upload → remote sha256 double-check (the port verifies in transit; the spec wants post-copy proof). */
  async #provisionByCopy(input: ProvisionInput, staging: string, target: string): Promise<string> {
    const localPath = input.localBinaryPath ?? process.execPath;
    let localSha = input.clientSha256;

    if (localSha === undefined) {
      localSha = await sha256LocalFile(localPath);
    }

    try {
      await this.#transfer.upload({ localPath, remotePath: staging });
    } catch (error) {
      throw new BinaryProvisioningError(
        `copy path failed: could not upload ${localPath} to ${staging} — ${describeError(error)}`,
        { cause: error }
      );
    }

    const remoteProbe = await this.#remoteSha256(staging);

    if (remoteProbe.kind !== 'sha' || remoteProbe.sha !== localSha) {
      await this.#exec(`rm -f '${staging}'`);
      const remoteText =
        remoteProbe.kind === 'sha'
          ? `${remoteProbe.sha.slice(0, 12)}…`
          : remoteProbe.kind === 'missing'
            ? '(missing)'
            : `unhashable: ${remoteProbe.detail}`;
      throw new BinaryProvisioningError(
        `copy path failed: sha256 mismatch after upload — local ${localSha.slice(0, 12)}… vs remote ${remoteText} at ${staging} (target ${target})`
      );
    }

    return localSha;
  }

  /** curl the per-arch asset + sidecar, verify the checksum before the move (3.15). */
  async #provisionByDownload(input: ProvisionInput, staging: string, target: string): Promise<string> {
    if (input.source.kind !== 'download-release-asset') {
      throw new BinaryProvisioningError('internal: download requested for a copy-path decision');
    }

    const asset = input.source.asset;
    const assetUrl = `${this.#releaseBaseUrl}/v${input.version}/${asset}`;
    const sidecarUrl = `${assetUrl}.sha256`;
    const sidecarPath = `${staging}.sha256`;

    await this.#exec(`curl -fsSL '${assetUrl}' -o '${staging}'`, {
      arch: asset,
      attempted: [assetUrl, staging, target],
    });
    await this.#exec(`curl -fsSL '${sidecarUrl}' -o '${sidecarPath}'`, {
      arch: asset,
      attempted: [sidecarUrl, sidecarPath],
      failMessage: `download path failed: could not fetch the sha256 sidecar ${sidecarUrl} to ${sidecarPath} — the release asset is unusable without it`,
    });

    const sidecarContent = await this.#exec(`cat '${sidecarPath}'`, {
      arch: asset,
      attempted: [sidecarPath],
      failMessage: `download path failed: could not read the sha256 sidecar at ${sidecarPath}`,
    });
    const expectedSha = parseSidecarSha256(sidecarContent.stdout);
    const actualProbe = await this.#remoteSha256(staging);

    if (expectedSha === undefined) {
      await this.#exec(`rm -f '${staging}' '${sidecarPath}'`);
      throw new BinaryProvisioningError(
        `download path failed: could not parse a sha256 out of the sidecar ${sidecarPath} (content: ${JSON.stringify(sidecarContent.stdout.slice(0, 80))}) — arch ${asset}, asset ${assetUrl}`
      );
    }

    if (actualProbe.kind !== 'sha' || actualProbe.sha !== expectedSha) {
      await this.#exec(`rm -f '${staging}' '${sidecarPath}'`);
      const actualText =
        actualProbe.kind === 'sha'
          ? actualProbe.sha
          : actualProbe.kind === 'missing'
            ? '(missing)'
            : `unhashable: ${actualProbe.detail}`;
      throw new BinaryProvisioningError(
        `download path failed: checksum verification for arch ${asset} — asset ${assetUrl} downloaded to ${staging} has sha256 ${actualText} but the sidecar declares ${expectedSha}; the asset may be corrupted`
      );
    }

    return actualProbe.sha;
  }

  async #remoteHome(): Promise<string> {
    // sftp-server does NOT expand tilde — resolve the home over exec (6.8).
    const result = await this.#exec('printf %s "$HOME"', {
      failMessage: 'could not resolve the remote home directory',
    });
    const home = result.stdout.trim();

    if (home === '') {
      throw new BinaryProvisioningError('could not resolve the remote home directory (empty $HOME)');
    }

    return home;
  }

  /**
   * `sha256sum <path>` → discriminated probe. A file that does not exist reads
   * as 'missing' (stderr match — coreutils AND busybox wording); ANY other
   * failure (transport drop, exit ≠ 0, unparseable output) reads as 'failed'
   * so callers can refuse instead of confusing "cannot verify" with "absent".
   */
  async #remoteSha256(path: string): Promise<RemoteShaProbe> {
    let result: RemoteCommandResult;

    try {
      result = await this.#runner.run(`sha256sum '${path}'`);
    } catch (error) {
      return { kind: 'failed', detail: `transport failure: ${describeError(error)}` };
    }

    if (result.exitCode === 0) {
      const sha = parseSha256Sum(result.stdout);
      return sha !== undefined
        ? { kind: 'sha', sha }
        : { kind: 'failed', detail: `unparseable sha256sum output: ${JSON.stringify(result.stdout.slice(0, 80))}` };
    }

    if (/no such file or directory/i.test(result.stderr)) return { kind: 'missing' };

    return {
      kind: 'failed',
      detail: `sha256sum exited ${result.exitCode ?? 'signal'}: ${result.stderr.trim() || 'no stderr'}`,
    };
  }

  async #exec(
    command: string,
    context?: { arch?: string; attempted?: string[]; failMessage?: string }
  ): Promise<RemoteCommandResult> {
    let result: RemoteCommandResult;

    try {
      result = await this.#runner.run(command);
    } catch (error) {
      throw new BinaryProvisioningError(transportFailure(command, context), { cause: error });
    }

    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || `exit code ${result.exitCode}`;
      const suffix =
        context?.arch !== undefined
          ? ` (arch ${context.arch}` + (context.attempted ? `; attempted: ${context.attempted.join(', ')}` : '') + ')'
          : '';
      throw new BinaryProvisioningError(`${context?.failMessage ?? `remote command failed`}: ${detail}${suffix}`);
    }

    return result;
  }
}

/**
 * Decoy rule (3.13): replace only when the existing bytes ARE the new binary
 * (reinstall) or the recorded prior install (upgrade). Anything else refuses.
 */
export function isSafeToReplace(existingSha: string, newSha: string, priorInstallSha?: string): boolean {
  if (existingSha === newSha) return true;

  return priorInstallSha !== undefined && existingSha === priorInstallSha;
}

/** First token of a `sha256sum`/sidecar line (`<sha>  <file>`). */
export function parseSha256Sum(stdout: string): string | undefined {
  const token = stdout.trim().split(/\s+/)[0] ?? '';
  return /^[0-9a-f]{64}$/.test(token) ? token : undefined;
}

/** Sidecars ship `<sha>  <asset-name>`; tolerate sha256sum-style lines only. */
export function parseSidecarSha256(content: string): string | undefined {
  return parseSha256Sum(content);
}

/** Stream-hash a local file (no sync reads of whole binaries into memory). */
export async function sha256LocalFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

function transportFailure(
  command: string,
  context?: { arch?: string; attempted?: string[]; failMessage?: string }
): string {
  const suffix =
    context?.arch !== undefined
      ? ` (arch ${context.arch}; attempted: ${context.attempted?.join(', ') ?? command})`
      : '';
  return `${context?.failMessage ?? 'remote command could not run'}: ${command}${suffix}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
