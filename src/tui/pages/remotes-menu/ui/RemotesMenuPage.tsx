// RemotesMenuPage.tsx — The remotes menu as a two-mode page: without an
// active remote it is the SELECTION screen (model/remotes-selection fetches
// the configured remotes through the repository port; Enter selects one via
// the injected callback — session-only state owned by App); with an active
// remote it is the remotes submenu (model/remotes-menu composes feature-built
// groups + selectable). Entering with zero remotes configured redirects to
// the add wizard. All state arrives as props from the route shim (pages
// never import app/, per FSD). Command pages render alone at
// /remotes/<cmd>; this page only exists at /remotes itself.
import { useCallback, useMemo } from 'react';

import { Box, Text } from 'ink';

import { useNavigate } from 'react-router';

import type { RemoteRepository } from '../../../../domains/remotes/application/RemoteRepository.js';
import { useMenuList, useMenuNavigation, withEnablement } from '../../../features/menu/index.js';
import { ActionMenu } from '../../../widgets/action-menu/index.js';
import { getRemotesMenu } from '../model/remotes-menu.js';
import { useRemotesSelection } from '../model/remotes-selection.js';

export interface RemotesMenuPageProps {
  /** Persistence port, injected by the route shim (composition lives in app/). */
  repository: RemoteRepository;
  /** Name of the session's selected remote (undefined → selection screen). */
  activeRemote: string | undefined;
  /** Selects the session's remote (App-owned state via the route shim). */
  onSelectRemote: (name: string) => void;
}

export function RemotesMenuPage({
  repository,
  activeRemote,
  onSelectRemote,
}: RemotesMenuPageProps): React.ReactElement {
  const navigate = useNavigate();
  const selecting = activeRemote === undefined;

  // Selection mode: fetch + cursor/Enter over the configured remotes.
  const handleEmpty = useCallback(() => navigate('/remotes/add'), [navigate]);
  const selection = useRemotesSelection({
    repository,
    enabled: selecting,
    onSelect: onSelectRemote,
    onEmpty: handleEmpty,
  });
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
          <ActionMenu groups={selectionGroups} focusedId={selection.focusedId} />
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
