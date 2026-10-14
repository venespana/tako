// routes/index.tsx — Route shim for '/': adapts the app runtime store's
// session state into HomePage's prop (activeRemote → hasActiveRemote), keeping
// the page free of app-layer imports (FSD). Subscribing to the store here
// means selecting a remote re-renders the home menu with gated items live.
//
// 9.14c: HOME is OUTSIDE any remote — arriving here leaves the remote
// context. The selection (name, password, cached agent version) clears and
// the agent session, if one is open, closes through the tasks store's public
// API. App imports features (the allowed direction): the store never knows
// about routing, the shim never owns session state.
import { useEffect } from 'react';

import { HomePage } from '../../pages/home/index.js';
import { useTasksStore } from '../../pages/tasks/index.js';
import type { RouteHandle } from '../../shared/lib/route-tree.js';
import { useAppRuntimeStore } from '../providers/app-runtime-store.js';

function HomeRoute(): React.ReactElement {
  const activeRemote = useAppRuntimeStore(state => state.activeRemote);
  const clearActiveRemote = useAppRuntimeStore(state => state.clearActiveRemote);
  const disconnect = useTasksStore(state => state.disconnect);

  useEffect(() => {
    clearActiveRemote();
    void disconnect();
  }, [clearActiveRemote, disconnect]);

  return <HomePage hasActiveRemote={activeRemote !== undefined} />;
}

export default HomeRoute;

/** Home drives the registry menu (full footer hints). */
export const routeMeta = { menu: true } satisfies RouteHandle;
