// helpers/install-deps.ts — builds the REAL pipeline deps for the gated e2e
// suites, mirroring the production wiring in services/agent.ts
// (installAgent): ONE installing session (manager owns the runner and the
// SFTP transfer), a closeInstaller that fully ends that session (the
// survive-disconnect probe requires it), and an independent verifier
// connection B. The gated suites never ran under the old bare-config
// contract; this keeps them on the CURRENT pipeline contract for good.
//
// Test-only infrastructure, outside the FSD layers.
import type { AgentInstallDeps } from '../../../src/domains/agent/infrastructure/AgentInstallPipeline.js';
import { SftpRemoteFileTransfer } from '../../../src/domains/remotes/infrastructure/SftpRemoteFileTransfer.js';
import { SshConnectionManager } from '../../../src/domains/remotes/infrastructure/SshConnectionManager.js';
import { SshRemoteCommandRunner } from '../../../src/domains/remotes/infrastructure/SshRemoteCommandRunner.js';
import { StreamLocalAgentChannel } from '../../../src/domains/remotes/infrastructure/StreamLocalAgentChannel.js';

interface RemoteEndpoint {
  readonly host: string;
  readonly port: number;
}

/** The deps runAgentInstall accepts, over REAL ssh against the endpoint. */
export function buildInstallDeps(options: {
  readonly endpoint: RemoteEndpoint;
  readonly password: string;
  readonly log: (line: string) => void;
  readonly clientVersion: string;
  /** Test seam passthrough: e.g. { localBinaryPath } (RA-002 copy path) or
   * { clientPlatform: 'darwin' } to force the releases download (RA-003). */
  readonly provisionOverrides?: AgentInstallDeps['provisionOverrides'];
}): AgentInstallDeps {
  const config = {
    host: options.endpoint.host,
    port: options.endpoint.port,
    username: 'tako',
    auth: { type: 'password', password: options.password },
  } as const;

  // Connection A: the installing session (closed fully by closeInstaller).
  const installer = new SshConnectionManager(config);
  const runner = new SshRemoteCommandRunner(installer);
  const transfer = new SftpRemoteFileTransfer(() => installer.sftp(), runner);

  // Connection B: fresh, INDEPENDENT verification connection for the probe
  // (openInstallVerifier's production shape in services/agent.ts).
  const openVerifier = async () => {
    const verifier = new SshConnectionManager(config);
    const verifierRunner = new SshRemoteCommandRunner(verifier);

    return {
      runner: verifierRunner,
      channel: new StreamLocalAgentChannel(verifier, verifierRunner),
      close: () => verifier.end(),
    };
  };

  return {
    runner,
    transfer,
    closeInstaller: () => installer.end(),
    openVerifier,
    clientVersion: options.clientVersion,
    ...(options.provisionOverrides !== undefined ? { provisionOverrides: options.provisionOverrides } : {}),
    log: options.log,
    error: line => options.log(`! ${line}`),
  };
}
