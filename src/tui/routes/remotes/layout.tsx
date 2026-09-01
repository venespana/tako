// routes/remotes/layout.tsx — Route shim for the '/remotes' layout: keeps the
// remotes submenu visible (master-detail) while child routes render in the
// Outlet below it. Menu props come from the root layout's outlet context.
import { Outlet, useOutletContext } from 'react-router';

import type { ScreenProps } from '../../features/menu/index.js';
import { RemotesLayout } from '../../pages/RemotesLayout.js';
import type { RouteHandle } from '../../shared/lib/route-tree.js';

function RemotesRoute(): React.ReactElement {
  const screen = useOutletContext<ScreenProps>();
  return (
    <RemotesLayout {...screen}>
      <Outlet />
    </RemotesLayout>
  );
}

export default RemotesRoute;

/** remotes and remotes/* show the logo and drive the submenu (children
 * inherit both through the match chain). */
export const routeMeta = { showLogo: true, menu: 'submenu' } satisfies RouteHandle;
