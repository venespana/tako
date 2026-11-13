// e2e/agent-releases-fallback.e2e.ts — Releases-download fallback end-to-end
// (task 8.16 — GATED, twice over).
//
// THE SCENARIO (design §Testing Strategy; spec remote-agent-install#Arch-
// mismatch-falls-back-to-Releases): on an ARCH MISMATCH the installer skips
// the SFTP copy path and downloads the SAME-VERSION per-arch asset from the
// PUBLISHED GitHub release (sha256 sidecar verified) onto the server. This
// needs a REAL published release with arm64 assets — impossible before the
// first release exists — so the suite is gated by TAKO_E2E_RELEASES=1 AND an
// env-pinned version (TAKO_E2E_RELEASE_VERSION) whose assets must already be
// published.
//
// GATED: skips (never fails) unless both env vars are set; additionally
// asserts the host is arm64 so the copy path cannot win.
import { mkdtempSync, rmSync } from 'node:fs';
import { arch, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StartedTestContainer } from 'testcontainers';
import { afterAll, describe, expect, it } from 'vitest';

import { startArm64SystemdContainer } from './helpers/arm64-systemd.js';
import { buildInstallDeps } from './helpers/install-deps.js';
import { runAgentInstall, type AgentInstallDeps } from '../../src/domains/agent/infrastructure/AgentInstallPipeline.js';

const GATED = process.env['TAKO_E2E_RELEASES'] === '1';
const RELEASE_VERSION = process.env['TAKO_E2E_RELEASE_VERSION'] ?? '';
const SSH_PASSWORD = 'releases-e2e-pass';

const describeGated = GATED && RELEASE_VERSION !== '' ? describe : describe.skip;

interface RemoteEndpoint {
  readonly host: string;
  readonly port: number;
}

function installDeps(endpoint: RemoteEndpoint, log: (line: string) => void): AgentInstallDeps {
  // Pretend the installing client runs on macOS (darwin): the arch mismatch
  // forces the Releases download path on the arm64 server, natively. The
  // pipeline builds `v<version>` itself, so a leading 'v' is stripped
  // (first real run downloaded from releases/download/vv0.7.0 → 404).
  return buildInstallDeps({
    endpoint,
    password: SSH_PASSWORD,
    log,
    clientVersion: RELEASE_VERSION.replace(/^v/u, ''),
    provisionOverrides: { clientPlatform: 'darwin' },
  });
}

describeGated('agent releases-fallback e2e — arch mismatch downloads the published asset (8.16)', () => {
  let container: StartedTestContainer;
  let endpoint: RemoteEndpoint;
  const logs: string[] = [];
  const log = (line: string): void => {
    logs.push(line);
  };

  afterAll(async () => {
    await container?.stop();
  });

  it('boots an arm64 systemd container on an arm64 host (mismatch vs any x64 binary)', async () => {
    expect(arch()).toBe('arm64'); // copy path could otherwise still win
    container = await startArm64SystemdContainer(SSH_PASSWORD);
    endpoint = { host: '127.0.0.1', port: container.getMappedPort(22) };
  });

  it('installs by downloading the published arm64 asset (checksum verified, probe passes)', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'tako-releases-e2e-'));

    try {
      const exit = await runAgentInstall(installDeps(endpoint, log));
      // The transcript rides the assertion: a failing pipeline must show WHY.
      expect(exit, logs.join('\n')).toBe(0);
      const transcript = logs.join('\n');
      expect(transcript).toContain('download'); // the fallback path ran…
      expect(transcript).toContain('survive-disconnect probe passed'); // …and honestly
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 120_000);
});
