// routes/remotes/index.tsx — Route shim for '/remotes': the remotes selection
// screen. Builds the domain stack and wires it into the page props.
import { ValidateSshConnection } from '../../../../domains/remotes/application/ValidateSshConnection.js';
import { ConfRemoteRepository } from '../../../../domains/remotes/infrastructure/ConfRemoteRepository.js';
import { createConfStore } from '../../../../domains/remotes/infrastructure/createConfStore.js';
import { Ssh2ConnectionTester } from '../../../../domains/remotes/infrastructure/Ssh2ConnectionTester.js';
import { RemotesMenuPage } from '../../../pages/remotes-menu/index.js';
import type { RouteHandle } from '../../../shared/lib/route-tree.js';
import { useAppRuntime } from '../../providers/app-runtime.js';

function buildStack() {
  const confStore = createConfStore();
  const repository = new ConfRemoteRepository(confStore);
  const validateConnection = new ValidateSshConnection(new Ssh2ConnectionTester());
  return { repository, validateConnection };
}

function RemotesRoute(): React.ReactElement {
  const { activateRemote } = useAppRuntime();
  const { repository, validateConnection } = buildStack();
  return (
    <RemotesMenuPage
      repository={repository}
      validateConnection={validateConnection}
      onActivateRemote={activateRemote}
    />
  );
}

export default RemotesRoute;

/** The remotes menu drives its selection/subcommand list (full footer hints). */
export const routeMeta = { menu: true } satisfies RouteHandle;
