// routes/cleanup.tsx — Route shim for '/cleanup' (isolated stub: no logo, no menu).
import { CleanupPage } from '../pages/CleanupPage.js';
import type { RouteHandle } from '../shared/lib/route-tree.js';

export default CleanupPage;

export const routeMeta = { showLogo: false } satisfies RouteHandle;
