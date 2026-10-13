// RemotesMenuPage.tsx — The remotes selection screen: lists configured remotes
// and lets the user activate one. Always available (active remote status lives
// in App runtime). Zero remotes redirects to the add wizard. Interactive remotes
// open a connect-time masked password prompt before activation; Esc cancels back
// to the list. The model consumes services/remotes directly (ADR-0019 §7);
// only the activation callback arrives as a prop (App-owned state via the
// route shim).
import { useCallback, useMemo } from 'react';

import { Box, Text } from 'ink';

import { PasswordInput } from '@inkjs/ui';
import { useNavigate } from 'react-router';

import { withEnablement } from '../../../features/menu/index.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';
import { EditingGuard } from '../../../shared/ui/EditingGuard.js';
import { ActionMenu } from '../../../widgets/action-menu/index.js';
import { useRemotesSelection } from '../model/remotes-selection.js';

export interface RemotesMenuPageProps {
  /** Activates the session's remote (App-owned state via the route shim). */
  onActivateRemote: (name: string, password?: string) => void;
}

export function RemotesMenuPage({ onActivateRemote }: RemotesMenuPageProps): React.ReactElement {
  const navigate = useNavigate();

  const handleEmpty = useCallback(() => navigate('/remotes/add'), [navigate]);
  const selection = useRemotesSelection({
    enabled: true,
    onActivate: onActivateRemote,
    onEmpty: handleEmpty,
  });
  const gated = selection.gate !== null;

  // Esc aborts the connect-time prompt; the model restores the list.
  useKeyBindings({ cancel: () => selection.cancelPrompt() }, { isActive: gated });

  // Render-ready selection groups: every listed remote is selectable.
  const selectionGroups = useMemo(
    () =>
      withEnablement(
        [{ id: 'select-remote', label: 'Select a remote', items: selection.selectable }],
        selection.selectable
      ),
    [selection.selectable]
  );

  if (selection.gate) {
    return (
      <EditingGuard isEditing={true}>
        <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
          <Box height={2} />
          <Text bold>Connect to {selection.gate.name}</Text>
          <Text dimColor>Password for this remote is never stored.</Text>
          {selection.gate.error && <Text color='red'>{selection.gate.error.message}</Text>}
          {selection.gate.phase === 'validating' ? (
            <Text dimColor>Validating connection…</Text>
          ) : (
            <PasswordInput placeholder='SSH password' onSubmit={selection.submitPassword} />
          )}
        </Box>
      </EditingGuard>
    );
  }

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      <Box height={2} />

      {selection.status === 'loading' && <Text dimColor>Loading remotes…</Text>}
      {selection.status === 'error' && <Text color='red'>Could not read configured remotes.</Text>}
      {selection.status === 'ready' && selection.selectable.length === 0 && (
        <Text dimColor>No remotes configured — opening the add wizard…</Text>
      )}
      {selection.status === 'ready' && selection.selectable.length > 0 && (
        <>
          <Text bold>Remotes</Text>
          <ActionMenu groups={selectionGroups} focusedId={selection.focusedId} />
        </>
      )}
    </Box>
  );
}
