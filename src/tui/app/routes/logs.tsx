// routes/logs.tsx — Route shim for '/logs' (tui-live-logs T2): the live logs
// screen for the ?container= query. The active remote and its session
// password come from the app runtime store (pages never import app/ — this
// shim is the composition point, mirroring the remote-home shim). Guards: no
// remote → home, missing/empty container → the hub (where the `l` key
// originates). The container keys the page — navigating to a different
// container remounts with fresh state instead of a stale-stream window. No
// routeMeta (command page: the footer shows back/quit only).
import { useEffect } from 'react';

import { useNavigate, useSearchParams } from 'react-router';

import { LogsPage } from '../../pages/logs/index.js';
import { useAppRuntimeStore } from '../providers/app-runtime-store.js';

function LogsRoute(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const container = searchParams.get('container') ?? '';
  const remote = useAppRuntimeStore(state => state.activeRemote);
  const sessionPassword = useAppRuntimeStore(state => state.activeRemotePassword);
  const navigate = useNavigate();

  // Guard redirects (the remote-home shim's pattern): the page's own guard
  // renders nothing meanwhile.
  useEffect(() => {
    if (remote === undefined) navigate('/');
    else if (container === '') navigate('/remote-home');
  }, [remote, container, navigate]);

  return <LogsPage key={container} remote={remote ?? ''} sessionPassword={sessionPassword} container={container} />;
}

export default LogsRoute;
