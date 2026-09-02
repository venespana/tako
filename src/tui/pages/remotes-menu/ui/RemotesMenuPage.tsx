// RemotesMenuPage.tsx — The remotes submenu as a page (the old master-detail
// RemotesLayout is gone): owns its submenu data (model/remotes-menu composes
// feature-built groups + selectable) and its list interaction (useMenuList +
// useMenuNavigation). Command pages render alone at /remotes/<cmd>; this
// page only exists at /remotes itself.
import { useMemo } from 'react';

import { Box } from 'ink';

import { useMenuList, useMenuNavigation } from '../../../features/menu/index.js';
import { ActionMenu } from '../../../widgets/ActionMenu.js';
import { getRemotesMenu } from '../model/remotes-menu.js';

export function RemotesMenuPage(): React.ReactElement {
  // Groups and selectable derive from the frozen registry — compute both
  // once per mount.
  const menu = useMemo(() => getRemotesMenu(), []);

  // Select = navigate to the subcommand's route (route guard + same-path
  // dedupe live in the hook).
  const handleSelect = useMenuNavigation();

  const { cursor } = useMenuList({ selectable: menu.selectable, onSelect: handleSelect });

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      {/* 2-line spacer under the logo */}
      <Box height={2} />

      <ActionMenu groups={menu.groups} selectable={menu.selectable} cursor={cursor} />
    </Box>
  );
}
