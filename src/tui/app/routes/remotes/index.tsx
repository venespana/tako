// routes/remotes/index.tsx — Route shim for '/remotes': the remotes menu
// page (menus are pages). Adapts the app runtime's session state into the
// page's props, keeping the page free of app-layer imports (FSD).
import Conf from 'conf';

import { ValidateSshConnection } from '../../../../domains/remotes/application/ValidateSshConnection.js';
import { ConfRemoteRepository } from '../../../../domains/remotes/infrastructure/ConfRemoteRepository.js';
import { Ssh2ConnectionTester } from '../../../../domains/remotes/infrastructure/Ssh2ConnectionTester.js';
import { RemotesMenuPage } from '../../../pages/remotes-menu/index.js';
import type { RouteHandle } from '../../../shared/lib/route-tree.js';
import { useAppRuntime } from '../../providers/app-runtime.js';

function buildStack() {
  const confStore = new Conf({ projectName: 'tako' });
  const repository = new ConfRemoteRepository(confStore);
  const validateConnection = new ValidateSshConnection(new Ssh2ConnectionTester());
  return { repository, validateConnection };
}

function RemotesRoute(): React.ReactElement {
  const { activeRemote, activateRemote } = useAppRuntime();
  const { repository, validateConnection } = buildStack();
  return (
    <RemotesMenuPage
      repository={repository}
      validateConnection={validateConnection}
      activeRemote={activeRemote}
      onActivateRemote={activateRemote}
    />
  );
}

export default RemotesRoute;

/** The remotes menu drives its selection/subcommand list (full footer hints). */
export const routeMeta = { menu: true } satisfies RouteHandle;
