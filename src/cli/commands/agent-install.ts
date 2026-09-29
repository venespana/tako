// cli/commands/agent-install.ts — CLI handler for `tako agent install <remote>` (tasks 6.3, 6.8)
//
// Thin composition over the agent domain: the install flow itself lives in
// infrastructure/AgentInstallPipeline.ts (preflight → hybrid binary
// distribution → systemd unit + linger → mandatory survive-disconnect probe)
// and is SHARED with the TUI's in-process install (9.19) so both surfaces run
// byte-identical order and semantics. This handler only resolves the remote,
// wires the real SSH adapters, prints plain console output, and maps the
// outcome to an exit code (0 ok, 1 refusal/failure).
//
// Session password (task 9.18): for interactive-credential remotes this
// command reads the session password from the `TAKO_SSH_PASSWORD` environment
// variable for non-interactive terminal runs. Since 9.19 the TUI does not
// spawn this command anymore (it installs in-process and passes the session
// password as connection material directly); a bare terminal run without the
// env var is still refused, and the refusal names the remedy.
import { runAgentInstall } from '../../domains/agent/infrastructure/AgentInstallPipeline.js';
import type { VerifierConnection } from '../../domains/agent/infrastructure/SurviveDisconnectProber.js';
import type { Remote } from '../../domains/remotes/domain/types.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';
import { VERSION } from '../../shared/lib/version.js';

/**
 * Default entry: resolve the remote from conf and wire real SSH adapters.
 * Interactive-credential remotes authenticate with `TAKO_SSH_PASSWORD` from
 * the environment for this run only (never argv, never logged).
 */
export async function runAgentInstallDefault(remoteName: string): Promise<number> {
  const resolved = await resolveRemote(remoteName);
  if (typeof resolved === 'number') return resolved;
  const { config } = resolved;
  const { SshConnectionManager } = await import('../../domains/remotes/infrastructure/SshConnectionManager.js');
  const { SshRemoteCommandRunner } = await import('../../domains/remotes/infrastructure/SshRemoteCommandRunner.js');
  const { SftpRemoteFileTransfer } = await import('../../domains/remotes/infrastructure/SftpRemoteFileTransfer.js');
  const { StreamLocalAgentChannel } = await import('../../domains/remotes/infrastructure/StreamLocalAgentChannel.js');

  const installer = new SshConnectionManager(config);
  const runner = new SshRemoteCommandRunner(installer);
  const transfer = new SftpRemoteFileTransfer(() => installer.sftp(), runner);
  const openVerifier = async (): Promise<VerifierConnection> => {
    const verifier = new SshConnectionManager(config);
    const verifierRunner = new SshRemoteCommandRunner(verifier);
    return {
      runner: verifierRunner,
      channel: new StreamLocalAgentChannel(verifier, verifierRunner),
      close: () => verifier.end(),
    };
  };

  return runAgentInstall({
    runner,
    transfer,
    closeInstaller: () => installer.end(),
    openVerifier,
    clientVersion: VERSION,
  });
}

export interface ResolvedRemoteConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth:
    { readonly type: 'password'; readonly password: string } | { readonly type: 'key'; readonly keyPath: string };
}

/** Outcome of mapping a configured remote to non-interactive connection auth. */
export type RemoteAuthDecision =
  | { readonly kind: 'resolved'; readonly auth: ResolvedRemoteConfig['auth'] }
  | { readonly kind: 'refusal'; readonly reason: string };

/**
 * Map a configured remote to connection auth (9.18). Interactive remotes
 * resolve ONLY with a session password — a terminal run supplies it via
 * `TAKO_SSH_PASSWORD` (env only, never argv); a bare run has none and is
 * refused, because a non-interactive run cannot prompt.
 */
export function decideRemoteAuth(
  remoteName: string,
  remote: Pick<Remote, 'credentialType' | 'keyPath' | 'obfuscatedPassword'>,
  sessionPassword: string | undefined,
  revealSecret: (obfuscated: string) => string
): RemoteAuthDecision {
  switch (remote.credentialType) {
    case 'ssh-key':
      return { kind: 'resolved', auth: { type: 'key', keyPath: remote.keyPath ?? '' } };
    case 'interactive':
      if (sessionPassword === undefined || sessionPassword === '') {
        return {
          kind: 'refusal',
          reason:
            `remote "${remoteName}" uses interactive credentials — the agent CLI needs non-interactive access; ` +
            're-add it with a stored password or key',
        };
      }
      return { kind: 'resolved', auth: { type: 'password', password: sessionPassword } };
    case 'store':
      return {
        kind: 'resolved',
        auth: { type: 'password', password: revealSecret(remote.obfuscatedPassword ?? '') },
      };
  }
}

export interface ResolveRemoteOptions {
  /** Test seam: environment supplying the session password (defaults to process.env). */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Resolve a configured remote into connection material (shared helper).
 * Interactive remotes need `TAKO_SSH_PASSWORD` in the environment (9.18);
 * the password is consumed for this run only and never printed.
 */
export async function resolveRemote(
  remoteName: string,
  options: ResolveRemoteOptions = {}
): Promise<{ readonly config: ResolvedRemoteConfig } | number> {
  // conf store built by the remotes infrastructure factory (Port/Adapter
  // Isolation: this CLI handler never imports the `conf` package directly)
  const { createConfStore } = await import('../../domains/remotes/infrastructure/createConfStore.js');
  const { ConfRemoteRepository } = await import('../../domains/remotes/infrastructure/ConfRemoteRepository.js');
  const { ConfSecretVault } = await import('../../domains/remotes/infrastructure/ConfSecretVault.js');
  const confStore = createConfStore();
  const repo = new ConfRemoteRepository(confStore);
  const remote = await repo.getByName(remoteName);
  if (remote === null) {
    console.error(`unknown remote "${remoteName}" — add it first with "tako remote add"`);
    return 1;
  }
  const vault = new ConfSecretVault(confStore);
  const decision = decideRemoteAuth(remoteName, remote, (options.env ?? process.env)[SESSION_PASSWORD_ENV], cipher =>
    vault.reveal(cipher)
  );
  if (decision.kind === 'refusal') {
    console.error(decision.reason);
    return 1;
  }
  return {
    config: {
      host: remote.host,
      port: remote.port,
      username: remote.username,
      auth: decision.auth,
    },
  };
}
