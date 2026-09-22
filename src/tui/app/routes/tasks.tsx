// routes/tasks.tsx — Route shim for '/tasks' (command page) AND the
// composition root for the tasks workspace (mirrors routes/remotes/add.tsx):
// resolves the ACTIVE remote into connection material, builds the SSH stack
// (SshConnectionManager → StreamLocalAgentChannel → StreamLocalAgentTransport)
// and injects the TasksGateway into the page. Pages never import app/, per
// FSD — the page only sees the gateway port.
import { useMemo } from 'react';

import Conf from 'conf';

import { StreamLocalAgentTransport } from '../../../domains/agent/infrastructure/StreamLocalAgentTransport.js';
import type { Remote } from '../../../domains/remotes/domain/types.js';
import { ConfRemoteRepository } from '../../../domains/remotes/infrastructure/ConfRemoteRepository.js';
import { ConfSecretVault } from '../../../domains/remotes/infrastructure/ConfSecretVault.js';
import { SshConnectionManager } from '../../../domains/remotes/infrastructure/SshConnectionManager.js';
import type { SshConnectAuth, SshConnectConfig } from '../../../domains/remotes/infrastructure/SshConnectionManager.js';
import { SshRemoteCommandRunner } from '../../../domains/remotes/infrastructure/SshRemoteCommandRunner.js';
import { StreamLocalAgentChannel } from '../../../domains/remotes/infrastructure/StreamLocalAgentChannel.js';
import { VERSION } from '../../../shared/lib/version.js';
import type { TasksGateway } from '../../features/tasks/job-list/index.js';
import { TasksPage } from '../../pages/tasks/index.js';
import { useAppRuntime } from '../providers/app-runtime.js';

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
 * Composition root: the gateway resolves the remote FRESH on every connect
 * (credentials may change mid-session), opens the SSH stack and the agent
 * transport, and persists the reconcile cursor per remote in conf.
 */
function buildTasksGateway(remote: string, sessionPassword: string | undefined): TasksGateway {
  const confStore = new Conf({ projectName: 'tako' });
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
      const transport = new StreamLocalAgentTransport({
        channel: new StreamLocalAgentChannel(manager, runner),
        clientVersion: VERSION,
      });
      return transport.connect();
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
  const { activeRemote, activeRemotePassword } = useAppRuntime();
  const gateway = useMemo(
    () => (activeRemote !== undefined ? buildTasksGateway(activeRemote, activeRemotePassword) : null),
    [activeRemote, activeRemotePassword]
  );
  return <TasksPage gateway={gateway} />;
}

export default TasksRoute;
