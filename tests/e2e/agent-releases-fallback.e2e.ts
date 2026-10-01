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

import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, describe, expect, it } from 'vitest';

import { runAgentInstall, type AgentInstallDeps } from '../../src/cli/commands/agent-install.js';

const GATED = process.env['TAKO_E2E_RELEASES'] === '1';
const RELEASE_VERSION = process.env['TAKO_E2E_RELEASE_VERSION'] ?? '';
const SSH_USER = 'tako';
const SSH_PASSWORD = 'releases-e2e-pass';

const describeGated = GATED && RELEASE_VERSION !== '' ? describe : describe.skip;

interface RemoteEndpoint {
  readonly host: string;
  readonly port: number;
}

function installDeps(endpoint: RemoteEndpoint, log: (line: string) => void): AgentInstallDeps {
  return {
    remoteName: 'releases-e2e',
    config: {
      host: endpoint.host,
      port: endpoint.port,
      username: SSH_USER,
      auth: { type: 'password', password: SSH_PASSWORD },
    },
    clientVersion: RELEASE_VERSION,
    // NO localBinaryPath on purpose: the arch mismatch forces the Releases
    // download path on the server (curl + .sha256 verify + atomic mv).
    log,
    error: line => log(`! ${line}`),
  };
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
    container = await new GenericContainer('jrei/systemd-ubuntu:latest')
      .withPrivilegedMode()
      .withExposedPorts(22)
      .start();
    endpoint = { host: '127.0.0.1', port: container.getMappedPort(22) };
  });

  it('installs by downloading the published arm64 asset (checksum verified, probe passes)', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'tako-releases-e2e-'));
    try {
      const exit = await runAgentInstall(installDeps(endpoint, log));
      expect(exit).toBe(0);
      const transcript = logs.join('\n');
      expect(transcript).toContain('download'); // the fallback path ran…
      expect(transcript).toContain('survive-disconnect probe passed'); // …and honestly
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 120_000);
});
