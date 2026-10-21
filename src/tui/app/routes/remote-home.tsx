// routes/remote-home.tsx — Route shim for '/remote-home': the Home/Remote
// hub screen (pen frame "Screen - Home / Remote"). Activating a remote lands
// here (app/routes/remotes/activate-and-enter.ts). Visibility-only
// iteration: the page renders a static fixture — no keyboard interaction,
// no real docker data, no tab switching yet; /tasks stays reachable later
// via the Global actions tab.
import { RemoteHomePage } from '../../pages/remote-home/index.js';
import type { RouteHandle } from '../../shared/lib/route-tree.js';

function RemoteHomeRoute(): React.ReactElement {
  return <RemoteHomePage />;
}

export default RemoteHomeRoute;

/** The hub drives the full menu footer hints (approved design). */
export const routeMeta = { menu: true } satisfies RouteHandle;
