// routes/remotes/index.tsx — Route shim for '/remotes': the remotes selection
// screen. The page consumes services/remotes directly (ADR-0019 §7); only the
// activation callback is wired here. Selecting a remote ACTIVATES it and
// enters its workspace (/tasks) directly — the remote's menu is its workspace
// (9.14b).
import { useMemo } from 'react';

import { useNavigate } from 'react-router';

import { activateAndEnterTasks } from './activate-and-enter.js';
import { RemotesMenuPage } from '../../../pages/remotes-menu/index.js';
import type { RouteHandle } from '../../../shared/lib/route-tree.js';
import { useAppRuntimeStore } from '../../providers/app-runtime-store.js';

function RemotesRoute(): React.ReactElement {
  const activateRemote = useAppRuntimeStore(state => state.activateRemote);
  const navigate = useNavigate();
  const onActivateRemote = useMemo(
    () => activateAndEnterTasks({ activateRemote }, path => navigate(path)),
    [activateRemote, navigate]
  );
  return <RemotesMenuPage onActivateRemote={onActivateRemote} />;
}

export default RemotesRoute;

/** The remotes menu drives its selection/subcommand list (full footer hints). */
export const routeMeta = { menu: true } satisfies RouteHandle;
