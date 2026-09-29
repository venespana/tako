// routes/remotes/index.tsx — Route shim for '/remotes': the remotes selection
// screen. Builds the domain stack and wires it into the page props. Selecting
// a remote ACTIVATES it and enters its workspace (/tasks) directly — the
// remote's menu is its workspace (9.14b).
import { useMemo } from 'react';

import { useNavigate } from 'react-router';

import { activateAndEnterTasks } from './activate-and-enter.js';
import { ValidateSshConnection } from '../../../../domains/remotes/application/ValidateSshConnection.js';
import { ConfRemoteRepository } from '../../../../domains/remotes/infrastructure/ConfRemoteRepository.js';
import { createConfStore } from '../../../../domains/remotes/infrastructure/createConfStore.js';
import { Ssh2ConnectionTester } from '../../../../domains/remotes/infrastructure/Ssh2ConnectionTester.js';
import { RemotesMenuPage } from '../../../pages/remotes-menu/index.js';
import type { RouteHandle } from '../../../shared/lib/route-tree.js';
import { useAppRuntimeStore } from '../../providers/app-runtime-store.js';

function buildStack() {
  const confStore = createConfStore();
  const repository = new ConfRemoteRepository(confStore);
  const validateConnection = new ValidateSshConnection(new Ssh2ConnectionTester());
  return { repository, validateConnection };
}

function RemotesRoute(): React.ReactElement {
  const activateRemote = useAppRuntimeStore(state => state.activateRemote);
  const navigate = useNavigate();
  const { repository, validateConnection } = buildStack();
  const onActivateRemote = useMemo(
    () => activateAndEnterTasks({ activateRemote }, path => navigate(path)),
    [activateRemote, navigate]
  );
  return (
    <RemotesMenuPage
      repository={repository}
      validateConnection={validateConnection}
      onActivateRemote={onActivateRemote}
    />
  );
}

export default RemotesRoute;

/** The remotes menu drives its selection/subcommand list (full footer hints). */
export const routeMeta = { menu: true } satisfies RouteHandle;
