// routes/status.tsx — Route shim for '/status' (isolated stub: no logo, no menu).
import { StatusPage } from '../pages/StatusPage.js';
import type { RouteHandle } from '../shared/lib/route-tree.js';

export default StatusPage;

export const routeMeta = { showLogo: false } satisfies RouteHandle;
