// routes/logs.tsx — Route shim for '/logs' (isolated stub: no logo, no menu).
import { LogsPage } from '../pages/LogsPage.js';
import type { RouteHandle } from '../shared/lib/route-tree.js';

export default LogsPage;

export const routeMeta = { showLogo: false } satisfies RouteHandle;
