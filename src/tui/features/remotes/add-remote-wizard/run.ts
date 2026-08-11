// tui/features/remotes/add-remote-wizard/run.ts — Wizard entry point for CLI
import React from 'react';

import { render } from 'ink';

import { AddRemoteWizard } from './AddRemoteWizard.js';
import { useWizardStore } from './wizard-store.js';
import type { AddRemote } from '../../../../domains/remotes/application/AddRemote.js';
import type { AddRemoteResult } from '../../../../domains/remotes/domain/types.js';

export type RunWizardDeps = {
  addRemoteUc: AddRemote;
};

/**
 * Render the AddRemoteWizard and return the final AddRemoteResult.
 *
 * Flow:
 * 1. render(<AddRemoteWizard />) — starts the wizard
 * 2. User interacts with TUI (name → user → host → port → type → creds → validating → hostkey-confirm)
 * 3. On 'done' step, execute AddRemote use case
 * 4. unmount() and return result
 */
export async function runAddRemoteWizard(deps: RunWizardDeps): Promise<AddRemoteResult> {
  // Reset store to clean state (singleton persists across runs in same process)
  useWizardStore.getState().reset();

  return new Promise(resolve => {
    let resolved = false;

    const { unmount } = render(
      React.createElement(AddRemoteWizard, {
        addRemoteUc: deps.addRemoteUc,
        onComplete: (result: AddRemoteResult) => {
          if (!resolved) {
            resolved = true;
            unmount();
            resolve(result);
          }
        },
      })
    );
  });
}
