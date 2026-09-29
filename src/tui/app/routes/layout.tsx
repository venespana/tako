// routes/layout.tsx — Root layout shim: the file convention maps this file to
// the route-tree root wrapping every screen. A tiny adapter that reads the
// app runtime store (session-scoped active remote + its handshake agent
// version, 9.14a) and passes both into the AppShell widget as props — the
// shell itself never imports app/ (FSD). No routeMeta: the shell owns
// chrome; menu flags belong to menu pages.
import { RouteErrorScreen } from '../../shared/ui/RouteErrorScreen.js';
import { AppShell } from '../../widgets/app-shell/index.js';
import { useAppRuntimeStore } from '../providers/app-runtime-store.js';

// 9.22: Ink-safe error boundary for the WHOLE branch — react-router's
// default error element renders raw text and crashes Ink (task 9.22).
export const errorElement = <RouteErrorScreen />;

function LayoutRoute(): React.ReactElement {
  // Selectors return PRIMITIVES: a selector returning a fresh array/object is
  // an unstable getSnapshot for useSyncExternalStore — React force-re-renders
  // forever ("getSnapshot should be cached", task 9.22 root cause).
  const activeRemote = useAppRuntimeStore(state => state.activeRemote);
  const agentVersion = useAppRuntimeStore(state => state.agentVersion);

  return <AppShell activeRemote={activeRemote} agentVersion={agentVersion} />;
}

export default LayoutRoute;
