// routes/tasks.tsx — Route shim for '/tasks' (command page) AND the
// composition root for the tasks workspace (mirrors routes/remotes/add.tsx):
// resolves the ACTIVE remote into connection material, builds the SSH stack
// (SshConnectionManager → StreamLocalAgentChannel → StreamLocalAgentTransport)
// and injects the TasksGateway into the page. Pages never import app/, per
// FSD — the page only sees the gateway port.
//
// 9.19: the gateway's install() runs the agent install IN-PROCESS — the shim
// composes the shared install pipeline (domains/agent AgentInstallPipeline:
// InstallAgent preflight → HybridBinaryProvisioner → SystemdRemoteController
// → SurviveDisconnectProber) over the SAME SSH stack as connect(), streaming
// the CLI-identical progress lines to the panel. No child process, no env
// var: the session password travels as connection material only (never env,
// never argv, never rendered).
import { useMemo } from 'react';

import { runAgentInstall } from '../../../domains/agent/infrastructure/AgentInstallPipeline.js';
import { StreamLocalAgentTransport } from '../../../domains/agent/infrastructure/StreamLocalAgentTransport.js';
import type { VerifierConnection } from '../../../domains/agent/infrastructure/SurviveDisconnectProber.js';
import type { Remote } from '../../../domains/remotes/domain/types.js';
import { ConfRemoteRepository } from '../../../domains/remotes/infrastructure/ConfRemoteRepository.js';
import { ConfSecretVault } from '../../../domains/remotes/infrastructure/ConfSecretVault.js';
import { createConfStore } from '../../../domains/remotes/infrastructure/createConfStore.js';
import { SftpRemoteFileTransfer } from '../../../domains/remotes/infrastructure/SftpRemoteFileTransfer.js';
import { SshConnectionManager } from '../../../domains/remotes/infrastructure/SshConnectionManager.js';
import type { SshConnectAuth, SshConnectConfig } from '../../../domains/remotes/infrastructure/SshConnectionManager.js';
import { SshRemoteCommandRunner } from '../../../domains/remotes/infrastructure/SshRemoteCommandRunner.js';
import { StreamLocalAgentChannel } from '../../../domains/remotes/infrastructure/StreamLocalAgentChannel.js';
import { VERSION } from '../../../shared/lib/version.js';
import { assertAgentSocketPresent, TasksPage } from '../../pages/tasks/index.js';
import type { AgentInstallOutcome, TasksGateway } from '../../pages/tasks/index.js';
import { useAppRuntimeStore } from '../providers/app-runtime-store.js';

/** conf section for the per-remote reconcile cursor (agent.db seq, client-side). */
const CURSOR_SECTION = 'agentTasks';

function cursorKey(remote: string): string {
  return `${CURSOR_SECTION}.lastSeq.${remote}`;
}

/** Resolve a remote entity into connection material (interactive uses the session password). */
function resolveAuth(entity: Remote, vault: ConfSecretVault, sessionPassword: string | undefined): SshConnectAuth {
  switch (entity.credentialType) {
    case 'ssh-key':
      return { type: 'key', keyPath: entity.keyPath ?? '' };
    case 'interactive':
      if (sessionPassword === undefined) {
        throw new Error(
          `remote "${entity.name}" uses interactive credentials — re-select it so Tako can ask for the password`
        );
      }
      return { type: 'password', password: sessionPassword };
    case 'store':
      return { type: 'password', password: vault.reveal(entity.obfuscatedPassword ?? '') };
  }
}

/**
 * Run the full agent install IN-PROCESS over a fresh SSH stack (9.19),
 * mirroring the CLI's `runAgentInstallDefault` wiring: same pipeline, same
 * connection shapes, same output lines — session material passed directly,
 * never via environment.
 */
async function runInProcessInstall(
  entity: Remote,
  vault: ConfSecretVault,
  sessionPassword: string | undefined,
  onLine: (line: string) => void
): Promise<AgentInstallOutcome> {
  const config: SshConnectConfig = {
    host: entity.host,
    port: entity.port,
    username: entity.username,
    auth: resolveAuth(entity, vault, sessionPassword),
  };
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

  let failure: string | undefined;
  const exitCode = await runAgentInstall({
    runner,
    transfer,
    closeInstaller: () => installer.end(),
    openVerifier,
    clientVersion: VERSION,
    log: onLine,
    error: line => {
      failure = line;
      onLine(line);
    },
  });
  return exitCode === 0 ? { ok: true } : { ok: false, error: failure ?? `installer exited with code ${exitCode}` };
}

/**
 * Composition root: the gateway resolves the remote FRESH on every connect
 * (credentials may change mid-session), opens the SSH stack and the agent
 * transport, and persists the reconcile cursor per remote in conf.
 */
function buildTasksGateway(remote: string, sessionPassword: string | undefined): TasksGateway {
  const confStore = createConfStore();
  const repository = new ConfRemoteRepository(confStore);
  const vault = new ConfSecretVault(confStore);

  return {
    remote,
    async connect() {
      const entity = await repository.getByName(remote);
      if (entity === null) {
        throw new Error(`unknown remote "${remote}" — configure it under remotes first`);
      }
      const config: SshConnectConfig = {
        host: entity.host,
        port: entity.port,
        username: entity.username,
        auth: resolveAuth(entity, vault, sessionPassword),
      };
      const manager = new SshConnectionManager(config);
      const runner = new SshRemoteCommandRunner(manager);
      // 9.17: probe the socket over exec BEFORE opening the transport channel
      // — a missing socket is the EXPECTED pre-install state, and it must
      // surface as the typed friendly error (the install panel consumes it),
      // not the cryptic channel-open failure. Other transport failures keep
      // their own messages.
      try {
        await assertAgentSocketPresent(runner, remote);
      } catch (error) {
        await manager.end();
        throw error;
      }
      const transport = new StreamLocalAgentTransport({
        channel: new StreamLocalAgentChannel(manager, runner),
        clientVersion: VERSION,
      });
      return transport.connect();
    },
    // 9.19: in-process install over the same stack — never throws (failures
    // land in the outcome so the panel can render them).
    async install(onLine) {
      try {
        const entity = await repository.getByName(remote);
        if (entity === null) {
          const detail = `unknown remote "${remote}" — configure it under remotes first`;
          onLine(detail);
          return { ok: false, error: detail };
        }
        return await runInProcessInstall(entity, vault, sessionPassword, onLine);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onLine(detail);
        return { ok: false, error: detail };
      }
    },
    loadCursor(): number {
      const value: unknown = confStore.get(cursorKey(remote));
      return typeof value === 'number' ? value : 0;
    },
    saveCursor(seq: number): void {
      confStore.set(cursorKey(remote), seq);
    },
  };
}

function TasksRoute(): React.ReactElement {
  const activeRemote = useAppRuntimeStore(state => state.activeRemote);
  const activeRemotePassword = useAppRuntimeStore(state => state.activeRemotePassword);
  const setAgentVersion = useAppRuntimeStore(state => state.setAgentVersion);
  const gateway = useMemo(
    () => (activeRemote !== undefined ? buildTasksGateway(activeRemote, activeRemotePassword) : null),
    [activeRemote, activeRemotePassword]
  );
  return (
    <TasksPage
      gateway={gateway}
      // 9.14a: the workspace's handshake publishes the agent version to the
      // shell header (the store action is identity-stable).
      onAgentVersion={setAgentVersion}
      // 9.19: the session password rides inside the gateway's closure (the
      // install composes in-process) — no env var, no child, no panel prop.
    />
  );
}

export default TasksRoute;
