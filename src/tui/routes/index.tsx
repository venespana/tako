// routes/index.tsx — Route shim for '/': adapts the app runtime's
// hasActiveRemote flag into HomePage's prop, keeping the page free of
// app-layer imports (FSD). Menu cursor/select live inside HomePage itself.
import { useAppRuntime } from '../app/app-runtime.js';
import { HomePage } from '../pages/HomePage.js';
import type { RouteHandle } from '../shared/lib/route-tree.js';

function HomeRoute(): React.ReactElement {
  const { hasActiveRemote } = useAppRuntime();
  return <HomePage hasActiveRemote={hasActiveRemote} />;
}

export default HomeRoute;

/** Home drives the home registry menu (full footer hints). */
export const routeMeta = { menu: 'home' } satisfies RouteHandle;
