// routes/remote-home.tsx — Route shim for '/remote-home': the Home/Remote
// hub screen (pen frame "Screen - Home / Remote"). Activating a remote lands
// here (app/routes/remotes/activate-and-enter.ts). The active remote and its
// session password come from the app runtime store (pages never import app/
// — this shim is the composition point, mirroring the status shim); key
// remounts the page when the remote changes — fresh loading state instead of
// a stale-data window. /tasks stays reachable later via the Global actions
// tab.
import { RemoteHomePage } from '../../pages/remote-home/index.js';
import type { RouteHandle } from '../../shared/lib/route-tree.js';
import { useAppRuntimeStore } from '../providers/app-runtime-store.js';

function RemoteHomeRoute(): React.ReactElement {
  const remote = useAppRuntimeStore(state => state.activeRemote);
  const sessionPassword = useAppRuntimeStore(state => state.activeRemotePassword);

  return <RemoteHomePage key={remote ?? ''} remote={remote ?? ''} sessionPassword={sessionPassword} />;
}

export default RemoteHomeRoute;

/** The hub drives the full menu footer hints (approved design). */
export const routeMeta = { menu: true } satisfies RouteHandle;
