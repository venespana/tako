// HomePage.tsx — The home menu as a page: owns its data (model/home-menu
// composes registry groups + gated selectable) and its list interaction
// (useMenuList + useMenuNavigation). Footer (hints + version) and logo are
// app-shell chrome, not part of this page.
import { useMemo } from 'react';

import { Box } from 'ink';

import { useMenuList, useMenuNavigation } from '../../../features/menu/index.js';
import { ActionMenu } from '../../../widgets/action-menu/index.js';
import { getHomeMenu } from '../model/home-menu.js';

export interface HomePageProps {
  /** Whether a remote is currently configured (gates hasActiveRemote items). */
  hasActiveRemote: boolean;
}

export function HomePage({ hasActiveRemote }: HomePageProps): React.ReactElement {
  // Registry identity is stable (frozen constant), so this memo is exact.
  const { groups, selectable } = useMemo(() => getHomeMenu(hasActiveRemote), [hasActiveRemote]);

  // Select = navigate to the item's route (route guard + same-path dedupe
  // live in the hook).
  const handleSelect = useMenuNavigation();

  const { cursor } = useMenuList({ selectable, onSelect: handleSelect });

  // The widget matches focus by id — map the controller's cursor index here.
  const focusedId = selectable[cursor]?.id;

  return (
    // flexGrow is owned by the shell's Outlet box; this page only lays out
    // its own content inside it.
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      {/* 2-line spacer under the logo */}
      <Box height={2} />

      <ActionMenu groups={groups} focusedId={focusedId} />
    </Box>
  );
}
