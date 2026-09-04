// routes/index.tsx — Route shim for '/': adapts the app runtime's session
// state into HomePage's prop (activeRemote → hasActiveRemote), keeping the
// page free of app-layer imports (FSD). Consuming the context here means
// selecting a remote re-renders the home menu with gated items live.
import { HomePage } from '../../pages/home/index.js';
import type { RouteHandle } from '../../shared/lib/route-tree.js';
import { useAppRuntime } from '../providers/app-runtime.js';

function HomeRoute(): React.ReactElement {
  const { activeRemote } = useAppRuntime();
  return <HomePage hasActiveRemote={activeRemote !== undefined} />;
}

export default HomeRoute;

/** Home drives the registry menu (full footer hints). */
export const routeMeta = { menu: true } satisfies RouteHandle;
