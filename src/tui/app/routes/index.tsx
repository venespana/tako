// routes/index.tsx — Route shim for '/': adapts the app runtime's
// hasActiveRemote flag into HomePage's prop, keeping the page free of
// app-layer imports (FSD). Menu cursor/select live inside HomePage itself.
import { HomePage } from '../../pages/home/index.js';
import type { RouteHandle } from '../../shared/lib/route-tree.js';
import { useAppRuntime } from '../providers/app-runtime.js';

function HomeRoute(): React.ReactElement {
  const { hasActiveRemote } = useAppRuntime();
  return <HomePage hasActiveRemote={hasActiveRemote} />;
}

export default HomeRoute;

/** Home drives the registry menu (full footer hints). */
export const routeMeta = { menu: true } satisfies RouteHandle;
