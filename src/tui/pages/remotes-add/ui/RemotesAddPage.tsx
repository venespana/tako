// RemotesAddPage.tsx — The remotes.add page: renders the add-remote wizard
// (the TUI's interactive add flow — the CLI drives the same flow flags/stdin,
// ADR-0020). The wizard talks to services/remotes directly; the page owns
// only navigation and store hygiene: the wizard store is a process singleton
// by design, so the page resets it on mount/unmount — every page entry starts
// a fresh wizard run. Completing or aborting navigates back to the main
// menu ('/').
import { useEffect } from 'react';

import { Box } from 'ink';

import { useNavigate } from 'react-router';

import { AddRemoteWizard } from './AddRemoteWizard.js';
import { useWizardStore } from '../model/wizard-store.js';

export function RemotesAddPage(): React.ReactElement {
  const navigate = useNavigate();
  // 9.21: the reset action comes from a selector hook (zustand actions are
  // identity-stable) — components use hooks, never getState().
  const resetWizard = useWizardStore(state => state.reset);

  // Fresh wizard state for every page entry (unmount reset leaves the store
  // clean for the next entry).
  useEffect(() => {
    resetWizard();
    return () => {
      resetWizard();
    };
  }, [resetWizard]);

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      {/* 2-line spacer under the logo */}
      <Box height={2} />

      <AddRemoteWizard
        onComplete={() => {
          // Done (saved) or aborted — either way back to the main menu.
          navigate('/');
        }}
      />
    </Box>
  );
}
