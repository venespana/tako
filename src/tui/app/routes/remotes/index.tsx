// routes/remotes/index.tsx — Route shim for '/remotes': the remotes submenu
// page (menus are pages).
import { RemotesMenuPage } from '../../../pages/RemotesMenuPage.js';
import type { RouteHandle } from '../../../shared/lib/route-tree.js';

export default RemotesMenuPage;

/** The remotes submenu drives the submenu list (full footer hints). */
export const routeMeta = { menu: 'submenu' } satisfies RouteHandle;
