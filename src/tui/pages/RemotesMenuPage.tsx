// RemotesMenuPage.tsx — The remotes submenu as a page (the old master-detail
// RemotesLayout is gone): owns its submenu data (feature-built groups +
// selectable) and its list interaction (useMenuList). Command pages render
// alone at /remotes/<cmd>; this page only exists at /remotes itself.
import { useMemo } from 'react';

import { Box } from 'ink';

import { useLocation, useNavigate } from 'react-router';

import { getRemotesGroups, getRemotesSelectable, useMenuList } from '../features/menu/index.js';
import type { ActionItem } from '../features/menu/index.js';
import { ActionMenu } from '../widgets/ActionMenu.js';

export function RemotesMenuPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();

  // Groups and selectable derive from the frozen registry — compute both
  // once per mount.
  const menu = useMemo(() => ({ groups: getRemotesGroups(), selectable: getRemotesSelectable() }), []);

  // Select = navigate to the subcommand's route (same path deduped as a no-op).
  const handleSelect = (item: ActionItem): void => {
    if (item.route === undefined) return;
    if (location.pathname === item.route) return;
    navigate(item.route);
  };

  const { cursor } = useMenuList({ selectable: menu.selectable, onSelect: handleSelect });

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      {/* 2-line spacer under the logo */}
      <Box height={2} />

      <ActionMenu groups={menu.groups} selectable={menu.selectable} cursor={cursor} />
    </Box>
  );
}
