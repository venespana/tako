// routes/tasks.tsx — Route shim for '/tasks': hands the page PLAIN DATA
// (the active remote + its session password from the app runtime store) and
// the agent-version publisher. Since ADR-0019 the page talks to the services
// layer directly — this shim composes nothing: no gateways, no adapters, no
// conf. (Session material stays in props/closures: never env, never argv,
// never rendered.)
import { TasksPage } from '../../pages/tasks/index.js';
import { useAppRuntimeStore } from '../providers/app-runtime-store.js';

function TasksRoute(): React.ReactElement {
  const activeRemote = useAppRuntimeStore(state => state.activeRemote);
  const activeRemotePassword = useAppRuntimeStore(state => state.activeRemotePassword);
  const setAgentVersion = useAppRuntimeStore(state => state.setAgentVersion);
  return (
    <TasksPage
      remote={activeRemote ?? null}
      sessionPassword={activeRemotePassword}
      // 9.14a: the workspace's handshake publishes the agent version to the
      // shell header (the store action is identity-stable).
      onAgentVersion={setAgentVersion}
    />
  );
}

export default TasksRoute;
