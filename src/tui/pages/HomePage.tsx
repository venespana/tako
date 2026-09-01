// HomePage.tsx — The home menu as a page: owns its data (registry groups +
// selectable) and its list interaction (useMenuList). Footer (hints +
// version) and logo are app-shell chrome, not part of this page.
import { useMemo } from 'react';

import { Box } from 'ink';

import { useLocation, useNavigate } from 'react-router';

import { getRegistry, getSelectable, useMenuList } from '../features/menu/index.js';
import type { ActionItem } from '../features/menu/index.js';
import { ActionMenu } from '../widgets/ActionMenu.js';

export interface HomePageProps {
  /** Whether a remote is currently configured (gates hasActiveRemote items). */
  hasActiveRemote: boolean;
}

export function HomePage({ hasActiveRemote }: HomePageProps): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();

  // Registry identity is stable (frozen constant), so this memo is exact.
  const groups = getRegistry();
  const selectable = useMemo(() => getSelectable(groups, hasActiveRemote), [groups, hasActiveRemote]);

  // Select = navigate to the item's route (registry items only ever carry
  // valid route paths; the same path is deduped as a no-op).
  const handleSelect = (item: ActionItem): void => {
    if (item.route === undefined) return;
    if (location.pathname === item.route) return;
    navigate(item.route);
  };

  const { cursor } = useMenuList({ selectable, onSelect: handleSelect });

  return (
    // flexGrow is owned by the shell's Outlet box; this page only lays out
    // its own content inside it.
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      {/* 2-line spacer under the logo */}
      <Box height={2} />

      <ActionMenu groups={groups} selectable={selectable} cursor={cursor} />
    </Box>
  );
}
