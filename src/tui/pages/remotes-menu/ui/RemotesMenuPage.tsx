// RemotesMenuPage.tsx — The remotes submenu as a page (the old master-detail
// RemotesLayout is gone): owns its submenu data (model/remotes-menu composes
// feature-built groups + selectable) and its list interaction (useMenuList +
// useMenuNavigation). Command pages render alone at /remotes/<cmd>; this
// page only exists at /remotes itself.
import { useMemo } from 'react';

import { Box } from 'ink';

import { useMenuList, useMenuNavigation } from '../../../features/menu/index.js';
import { ActionMenu } from '../../../widgets/action-menu/index.js';
import { getRemotesMenu } from '../model/remotes-menu.js';

export function RemotesMenuPage(): React.ReactElement {
  // Groups and selectable derive from the frozen registry — compute both
  // once per mount.
  const menu = useMemo(() => getRemotesMenu(), []);

  // Select = navigate to the subcommand's route (route guard + same-path
  // dedupe live in the hook).
  const handleSelect = useMenuNavigation();

  const { cursor } = useMenuList({ selectable: menu.selectable, onSelect: handleSelect });

  // The widget matches focus by id — map the controller's cursor index here.
  const focusedId = menu.selectable[cursor]?.id;

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      {/* 2-line spacer under the logo */}
      <Box height={2} />

      <ActionMenu groups={menu.groups} focusedId={focusedId} />
    </Box>
  );
}
