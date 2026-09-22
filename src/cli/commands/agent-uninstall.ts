// cli/commands/agent-uninstall.ts — CLI handler for `tako agent uninstall <remote>` (task 6.4)
//
// Reverse of install in the EXACT design order (design §Probe Mechanics):
// read linger-by-tako via the agent transport BEFORE any teardown →
// `systemctl --user disable --now` → rm unit → daemon-reload → disable
// linger IFF Tako enabled it → rm -rf ~/.tako → residue verify on a SECOND
// connection. When the transport is unreachable, linger stays enabled and
// the operator gets a warning (the only-by-tako rule is never guessed).
import { uninstallLingerGuard } from '../../domains/agent/application/use-cases/UninstallAgent.js';
import { RemoteInstallRecords } from '../../domains/agent/infrastructure/AgentInstallRecords.js';
import { StreamLocalAgentTransport } from '../../domains/agent/infrastructure/StreamLocalAgentTransport.js';
import { type VerifierConnection } from '../../domains/agent/infrastructure/SurviveDisconnectProber.js';
import { SystemdRemoteController } from '../../domains/agent/infrastructure/SystemdRemoteController.js';
import type { AgentChannel } from '../../domains/remotes/application/AgentChannel.js';
import type { RemoteCommandRunner } from '../../domains/remotes/application/RemoteCommandRunner.js';

const UNIT_TEST_ABSENT = `test -e "$HOME/.config/systemd/user/tako-agent.service"`;
const AGENT_DIR_TEST_ABSENT = `test -e "$HOME/.tako"`;

export interface AgentUninstallDeps {
  /** Connection A: teardown commands. */
  readonly runner: RemoteCommandRunner;
  /** Connection A: streamLocal channel for the linger-by-tako read. */
  readonly channel: AgentChannel;
  readonly clientVersion: string;
  /** Fresh, INDEPENDENT connection for the residue verification. */
  readonly openVerifier: () => Promise<VerifierConnection>;
  readonly log?: (line: string) => void;
  readonly error?: (line: string) => void;
}

export async function runAgentUninstall(deps: AgentUninstallDeps): Promise<number> {
  const log = deps.log ?? (line => console.log(line));
  const error = deps.error ?? (line => console.error(line));
  const controller = new SystemdRemoteController({ runner: deps.runner });
  const records = new RemoteInstallRecords(deps.runner);

  try {
    // Step 1 — read linger-by-tako over the agent transport (BEFORE teardown).
    const guard = await readLingerGuard(deps);
    if (guard.warning !== undefined) {
      error(`warning: ${guard.warning}`);
    }

    // Steps 2-4 — stop unit → remove unit → daemon-reload.
    await controller.disableUnit();
    log('unit stopped and disabled');
    await controller.removeUnitFile();
    await controller.daemonReload();
    log('unit file removed, systemd reloaded');

    // Step 5 — disable linger ONLY when Tako enabled it (D8).
    if (guard.disableLinger) {
      await controller.disableLinger();
      log('linger disabled (Tako enabled it)');
    } else {
      log('linger kept ENABLED (not recorded as Tako-enabled — only-by-tako rule)');
    }

    // Step 6 — remove the agent directory (binary, db, socket, records).
    const home = await records.home();
    const rmResult = await deps.runner.run(`rm -rf '${home}/.tako'`);
    if (rmResult.exitCode !== 0) {
      throw new Error(`could not remove ${home}/.tako: ${rmResult.stderr.trim() || `exit ${rmResult.exitCode}`}`);
    }

    // Step 7 — residue verification on an INDEPENDENT connection.
    return await verifyResidue(deps, guard.disableLinger, log, error);
  } catch (uninstallError) {
    error(uninstallError instanceof Error ? uninstallError.message : String(uninstallError));
    return 1;
  }
}

/** Step 1: connect → agent.status → close; unreachable → guard keeps linger. */
async function readLingerGuard(deps: AgentUninstallDeps) {
  try {
    const transport = new StreamLocalAgentTransport({ channel: deps.channel, clientVersion: deps.clientVersion });
    const session = await transport.connect();
    try {
      const status = await session.request('agent.status', {});
      return uninstallLingerGuard(status);
    } finally {
      await session.close();
    }
  } catch {
    return uninstallLingerGuard(undefined);
  }
}

/** Step 7: unit gone, ~/.tako gone, linger state as expected (second connection). */
async function verifyResidue(
  deps: AgentUninstallDeps,
  lingerWasDisabled: boolean,
  log: (line: string) => void,
  error: (line: string) => void
): Promise<number> {
  let verifier: VerifierConnection | undefined;
  try {
    verifier = await deps.openVerifier();
  } catch (openError) {
    error(
      `could not open the verification connection for residue checks: ${
        openError instanceof Error ? openError.message : String(openError)
      }`
    );
    return 1;
  }

  try {
    let residue = false;

    if ((await absentCheck(verifier.runner, UNIT_TEST_ABSENT)) === false) {
      log('residue: unit file still present');
      residue = true;
    }
    if ((await absentCheck(verifier.runner, AGENT_DIR_TEST_ABSENT)) === false) {
      log('residue: ~/.tako still present');
      residue = true;
    }

    if (lingerWasDisabled) {
      const lingerResult = await verifier.runner.run('loginctl show-user "$USER" --property=Linger');
      const lingerOff = lingerResult.exitCode === 0 && /^Linger=no$/m.test(lingerResult.stdout);
      if (!lingerOff) {
        log('residue: linger is still enabled after disable-linger');
        residue = true;
      }
    }

    if (residue) {
      error('uninstall finished WITH residue — inspect the server manually');
      return 1;
    }
    log('residue check on an independent connection: clean');
    return 0;
  } finally {
    await verifier.close();
  }
}

/** `test -e` wrapper: true when ABSENT (exit != 0); transport failure counts as residue. */
async function absentCheck(runner: RemoteCommandRunner, command: string): Promise<boolean> {
  try {
    const result = await runner.run(command);
    return result.exitCode !== 0;
  } catch {
    return false;
  }
}

/** Default entry: resolve the remote from conf and wire real SSH adapters. */
export async function runAgentUninstallDefault(remoteName: string): Promise<number> {
  const { resolveRemote } = await import('./agent-install.js');
  const resolved = await resolveRemote(remoteName);
  if (typeof resolved === 'number') return resolved;
  const { config } = resolved;
  const { SshConnectionManager } = await import('../../domains/remotes/infrastructure/SshConnectionManager.js');
  const { SshRemoteCommandRunner } = await import('../../domains/remotes/infrastructure/SshRemoteCommandRunner.js');
  const { StreamLocalAgentChannel } = await import('../../domains/remotes/infrastructure/StreamLocalAgentChannel.js');

  const teardown = new SshConnectionManager(config);
  const runner = new SshRemoteCommandRunner(teardown);
  const openVerifier = async (): Promise<VerifierConnection> => {
    const verifier = new SshConnectionManager(config);
    return {
      runner: new SshRemoteCommandRunner(verifier),
      channel: new StreamLocalAgentChannel(verifier, runner),
      close: () => verifier.end(),
    };
  };

  return runAgentUninstall({
    runner,
    channel: new StreamLocalAgentChannel(teardown, runner),
    clientVersion: (await import('../../shared/lib/version.js')).VERSION,
    openVerifier,
  });
}
