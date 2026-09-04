// routes/remotes/index.tsx — Route shim for '/remotes': the remotes menu
// page (menus are pages). Adapts the app runtime's session state and the
// composed remotes stack into the page's props, keeping the page free of
// app-layer imports (FSD).
import { RemotesMenuPage } from '../../../pages/remotes-menu/index.js';
import type { RouteHandle } from '../../../shared/lib/route-tree.js';
import { useAppRuntime } from '../../providers/app-runtime.js';
import { getRemotesStack } from '../../remotes-stack.js';

function RemotesRoute(): React.ReactElement {
  const { activeRemote, setActiveRemote } = useAppRuntime();
  return (
    <RemotesMenuPage
      repository={getRemotesStack().repository}
      activeRemote={activeRemote}
      onSelectRemote={setActiveRemote}
    />
  );
}

export default RemotesRoute;

/** The remotes menu drives its selection/subcommand list (full footer hints). */
export const routeMeta = { menu: true } satisfies RouteHandle;
