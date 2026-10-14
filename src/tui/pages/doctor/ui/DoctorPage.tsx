// DoctorPage.tsx — Doctor route: composes useDoctorCheck and renders DoctorScreen.
// The check is the services/system function (ADR-0019): adapters compose at
// call time inside the service, so importing the reference here does no
// module-level work (the Bun.spawn-binding constructor only runs per check).
import React, { useMemo } from 'react';

import { checkHostDependencies, type SystemCheckResult } from '../../../../services/system.js';
import { DoctorScreen } from '../../../features/doctor/index.js';

export function DoctorPage(): React.ReactElement {
  // Memoize so the function reference is stable across re-renders
  const runCheck = useMemo((): (() => Promise<SystemCheckResult>) => () => checkHostDependencies(), []);
  return <DoctorScreen runCheck={runCheck} />;
}
