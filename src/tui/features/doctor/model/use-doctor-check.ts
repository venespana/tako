// tui/features/doctor/model/use-doctor-check.ts — Runs the host-dependency check once on mount.
// No zustand store — stateless, each mount starts a fresh check.
import { useCallback, useEffect, useState } from 'react';

import type { SystemCheckResult } from '../../../../domains/system/domain/types.js';

export type DoctorCheckStatus =
  | { readonly status: 'idle' }
  | { readonly status: 'checking' }
  | { readonly status: 'done'; readonly result: SystemCheckResult }
  | { readonly status: 'error'; readonly error: unknown };

export interface UseDoctorCheckResult {
  readonly status: DoctorCheckStatus;
  /** Run the check manually (e.g. retry on error). */
  readonly runCheck: () => void;
}

/**
 * Runs `runCheck()` once on mount.
 *
 * @param checkFn - async function that returns a SystemCheckResult
 */
export function useDoctorCheck(checkFn: () => Promise<SystemCheckResult>): UseDoctorCheckResult {
  const [status, setStatus] = useState<DoctorCheckStatus>({ status: 'idle' });

  const runCheck = useCallback(() => {
    setStatus({ status: 'checking' });
    checkFn()
      .then(result => setStatus({ status: 'done', result }))
      .catch((error: unknown) => setStatus({ status: 'error', error }));
  }, [checkFn]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runCheck is a stable useCallback wrapping an async check; calling it in useEffect is the intended pattern (mirrors useAddRemoteWizard)
    runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runCheck is stable via useCallback
  }, []);

  return { status, runCheck };
}
