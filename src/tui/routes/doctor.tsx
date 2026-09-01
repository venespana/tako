// routes/doctor.tsx — Route shim for '/doctor' (isolated stub: no logo, no menu).
import { DoctorPage } from '../pages/DoctorPage.js';
import type { RouteHandle } from '../shared/lib/route-tree.js';

export default DoctorPage;

export const routeMeta = { showLogo: false } satisfies RouteHandle;
