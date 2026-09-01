// routes/remotes/layout.tsx — Route shim for the '/remotes' path prefix:
// pure passthrough. Menus are pages — the index route at '/remotes' renders
// the RemotesMenuPage, and '/remotes/<cmd>' renders ONLY the command page
// (the old master-detail layout is gone). No routeMeta: command pages get
// back/quit-only footer hints.
import { Outlet } from 'react-router';

function RemotesPassthroughRoute(): React.ReactElement {
  return <Outlet />;
}

export default RemotesPassthroughRoute;
