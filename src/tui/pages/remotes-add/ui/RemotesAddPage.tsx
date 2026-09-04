// RemotesAddPage.tsx — The remotes.add page: embeds the add-remote-wizard
// feature component (the same wizard `tako remote add` runs). The use case
// arrives as a prop from the route shim (composition lives in app/). The
// wizard store is a process singleton by design, so the page resets it on
// mount/unmount — every page entry starts a fresh wizard run. Completing or
// aborting navigates back to '/remotes', where the fresh remote shows up in
// the selection list.
import { useEffect } from 'react';

import { Box } from 'ink';

import { useNavigate } from 'react-router';

import type { AddRemote } from '../../../../domains/remotes/application/AddRemote.js';
import { AddRemoteWizard, useWizardStore } from '../../../features/remotes/add-remote-wizard/index.js';

export interface RemotesAddPageProps {
  /** Composed add-remote use case, injected by the route shim. */
  addRemoteUc: AddRemote;
}

export function RemotesAddPage({ addRemoteUc }: RemotesAddPageProps): React.ReactElement {
  const navigate = useNavigate();

  // Fresh wizard state for every page entry (the CLI entry point does the
  // same reset before its render; unmount reset leaves the store clean for
  // the next entry).
  useEffect(() => {
    useWizardStore.getState().reset();
    return () => {
      useWizardStore.getState().reset();
    };
  }, []);

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      {/* 2-line spacer under the logo */}
      <Box height={2} />

      <AddRemoteWizard
        addRemoteUc={addRemoteUc}
        onComplete={() => {
          // Done (saved) or aborted — either way back to the selection list,
          // where a freshly saved remote is immediately selectable.
          navigate('/remotes');
        }}
      />
    </Box>
  );
}
