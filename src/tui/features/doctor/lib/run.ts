// tui/features/doctor/lib/run.ts — ADR-0014 render→Promise entry for CLI.
// Mirrors runAddRemoteWizard: resolved guard, unmount() before resolve,
// resolve-once guarantee. Exported ONLY via the slice index.ts public API.
import React from 'react';

import { render } from 'ink';

import type { SystemCheckResult } from '../../../../domains/system/domain/types.js';
import { DoctorScreen } from '../ui/DoctorScreen.js';

export type RunDoctorDeps = {
  runCheck: () => Promise<SystemCheckResult>;
};

/**
 * Render the DoctorScreen and resolve with the SystemCheckResult.
 *
 * Flow:
 * 1. render(<DoctorScreen runCheck onComplete onError />)
 * 2. useDoctorCheck hook inside DoctorScreen runs check on mount
 * 3. Screen renders result frame
 * 4. User presses any key → unmount() and resolve with result
 */
export async function runDoctorScreen(deps: RunDoctorDeps): Promise<SystemCheckResult> {
  return new Promise(resolve => {
    let resolved = false;

    const handleComplete = (result: SystemCheckResult) => {
      if (!resolved) {
        resolved = true;
        unmount();
        resolve(result);
      }
    };

    const handleError = (_error: unknown) => {
      // Unexpected CLI errors map to exit 1 (spec defines only 0/1)
      if (!resolved) {
        resolved = true;
        unmount();
        process.exit(1);
      }
    };

    const { unmount } = render(
      React.createElement(DoctorScreen, {
        runCheck: deps.runCheck,
        onComplete: handleComplete,
        onError: handleError,
      })
    );
  });
}
