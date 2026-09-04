// routes/layout.tsx — Root layout shim: the file convention maps this file to
// the route-tree root wrapping every screen. A tiny adapter that reads the
// app runtime (session-scoped active remote) and passes it into the AppShell
// widget as a prop — the shell itself never imports app/ (FSD). No routeMeta:
// the shell owns chrome; menu flags belong to menu pages.
import { AppShell } from '../../widgets/app-shell/index.js';
import { useAppRuntime } from '../providers/app-runtime.js';

function LayoutRoute(): React.ReactElement {
  const { activeRemote } = useAppRuntime();
  return <AppShell activeRemote={activeRemote} />;
}

export default LayoutRoute;
