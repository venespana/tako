// routes/status.tsx — Route shim for '/status' (command page: no menu, so
// the footer shows back/quit hints plus the page's published hints). Status
// is a remote-context screen: the active remote and its session password
// come from the app runtime store (pages never import app/ — this shim is
// the composition point); with no remote active it redirects home.
import { useEffect } from 'react';

import { useNavigate } from 'react-router';

import { StatusPage } from '../../pages/status/index.js';
import { useAppRuntimeStore } from '../providers/app-runtime-store.js';

function StatusRoute(): React.ReactElement {
  const remote = useAppRuntimeStore(state => state.activeRemote);
  const sessionPassword = useAppRuntimeStore(state => state.activeRemotePassword);
  const navigate = useNavigate();

  // No active remote → there is nothing to show a stack status of; go home
  // (the remotes-menu onEmpty redirect pattern). The page renders nothing
  // meanwhile (its empty-remote guard).
  useEffect(() => {
    if (remote === undefined) navigate('/');
  }, [remote, navigate]);

  // key: a remote switch (unreachable through the current navigation, but
  // cheap to be correct about) remounts the page — fresh loading state
  // instead of a stale-data window.
  return <StatusPage key={remote ?? ''} remote={remote ?? ''} sessionPassword={sessionPassword} />;
}

export default StatusRoute;
