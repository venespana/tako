// RemotesMenuPage.tsx — The remotes menu as a two-mode page: without an
// active remote it is the SELECTION screen (model/remotes-selection fetches
// the configured remotes through the repository port; Enter activates one
// via the injected callback — session-only state owned by App). Interactive
// remotes open a connect-time masked password prompt (SSH-validated by the
// model gate) before activation; Esc cancels back to the list. With an
// active remote it is the remotes submenu (model/remotes-menu composes
// feature-built groups + selectable). Entering with zero remotes configured
// redirects to the add wizard. All state arrives as props from the route
// shim (pages never import app/, per FSD). Command pages render alone at
// /remotes/<cmd>; this page only exists at /remotes itself.
import { useCallback, useMemo } from 'react';

import { Box, Text, useInput } from 'ink';

import { PasswordInput } from '@inkjs/ui';
import { useNavigate } from 'react-router';

import type { RemoteRepository } from '../../../../domains/remotes/application/RemoteRepository.js';
import type { ValidateSshConnection } from '../../../../domains/remotes/application/ValidateSshConnection.js';
import { useMenuList, useMenuNavigation, withEnablement } from '../../../features/menu/index.js';
import { ActionMenu } from '../../../widgets/action-menu/index.js';
import { EditingGuard } from '../../../shared/ui/EditingGuard.js';
import { getRemotesMenu } from '../model/remotes-menu.js';
import { useRemotesSelection } from '../model/remotes-selection.js';

export interface RemotesMenuPageProps {
  /** Persistence port, injected by the route shim (composition lives in app/). */
  repository: RemoteRepository;
  /** SSH validation port for the connect-time gate (route shim injected). */
  validateConnection: ValidateSshConnection;
  /** Name of the session's selected remote (undefined → selection screen). */
  activeRemote: string | undefined;
  /** Activates the session's remote (App-owned state via the route shim). */
  onActivateRemote: (name: string, password?: string) => void;
}

export function RemotesMenuPage({
  repository,
  validateConnection,
  activeRemote,
  onActivateRemote,
}: RemotesMenuPageProps): React.ReactElement {
  const navigate = useNavigate();
  const selecting = activeRemote === undefined;

  // Selection mode: fetch + cursor/Enter over the configured remotes, with
  // the connect-time gate for interactive remotes.
  const handleEmpty = useCallback(() => navigate('/remotes/add'), [navigate]);
  const selection = useRemotesSelection({
    repository,
    validateConnection,
    enabled: selecting,
    onActivate: onActivateRemote,
    onEmpty: handleEmpty,
  });
  const gated = selection.gate !== null;

  // Esc aborts the connect-time prompt; the model restores the list.
  useInput(
    (_input, key) => {
      if (key.escape) selection.cancelPrompt();
    },
    { isActive: gated }
  );

  // Render-ready selection groups: every listed remote is selectable.
  const selectionGroups = useMemo(
    () =>
      withEnablement(
        [{ id: 'select-remote', label: 'Select a remote', items: selection.selectable }],
        selection.selectable
      ),
    [selection.selectable]
  );

  // Submenu mode: groups and selectable derive from the frozen registry —
  // compute both once per mount. Keys stay mounted in both modes (hooks
  // rules); the inactive list is empty so its handlers go inert.
  const menu = useMemo(() => getRemotesMenu(), []);
  const handleSelect = useMenuNavigation();
  const { cursor } = useMenuList({
    selectable: selecting ? [] : menu.selectable,
    onSelect: handleSelect,
  });
  const focusedId = selecting ? undefined : menu.selectable[cursor]?.id;

  if (selecting && selection.gate) {
    return (
      <EditingGuard isEditing={true}>
        <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
          {/* 2-line spacer under the logo */}
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

  if (selecting) {
    return (
      <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
        {/* 2-line spacer under the logo */}
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

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      {/* 2-line spacer under the logo */}
      <Box height={2} />

      <ActionMenu groups={menu.groups} focusedId={focusedId} />
    </Box>
  );
}
