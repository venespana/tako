// DoctorPage.tsx — Doctor route: composes useDoctorCheck and renders DoctorScreen.
import React, { useMemo } from 'react';

import type { SystemCheckResult } from '../../../../domains/system/domain/types.js';
import { DoctorScreen } from '../../../features/doctor/index.js';

/**
 * Composes the check function lazily to avoid instantiating Bun.spawn at
 * module level (LocalHostToolChecker constructor references Bun.spawn.bind).
 * The actual Bun.spawn call happens inside runCheck when the hook fires.
 */
function createDoctorCheck(): () => Promise<SystemCheckResult> {
  return async (): Promise<SystemCheckResult> => {
    // Dynamic imports so Bun.spawn is called at execution time, not import time
    const { CheckHostDependencies } = await import('../../../../domains/system/application/CheckHostDependencies.js');
    const { LocalHostToolChecker } = await import('../../../../domains/system/infrastructure/LocalHostToolChecker.js');
    const checker = new LocalHostToolChecker();
    const useCase = new CheckHostDependencies(checker);
    return useCase.checkAll();
  };
}

export function DoctorPage(): React.ReactElement {
  // Memoize so the function reference is stable across re-renders
  const runCheck = useMemo(() => createDoctorCheck(), []);
  return <DoctorScreen runCheck={runCheck} />;
}
