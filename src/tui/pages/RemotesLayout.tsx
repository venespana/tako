// RemotesLayout.tsx — Master-detail layout for the remotes section: the
// remotes submenu stays visible while the matched child route renders below
// it. Presentational only: menu props come from the root layout via the
// route adapter in routes/remotes/layout.tsx.
import { Box } from 'ink';

import type { ScreenProps } from '../features/menu/index.js';
import { ActionMenu } from '../widgets/ActionMenu.js';
import { KeyHints } from '../widgets/KeyHints.js';
import { VersionBar } from '../widgets/VersionBar.js';

export interface RemotesLayoutProps extends ScreenProps {
  /** The matched child route (renders nothing on /remotes itself). */
  children?: React.ReactNode;
}

export function RemotesLayout({ groups, selectable, cursor, children }: RemotesLayoutProps): React.ReactElement {
  return (
    // Same composition as the home screen (and the old remotes screen), with
    // the child outlet slotted between the menu and the footer.
    <Box flexDirection='column' alignItems='flex-start' flexGrow={1} paddingLeft={2}>
      {/* 2-line spacer at top */}
      <Box height={2} />

      {/* Submenu — visible on /remotes and every /remotes/* child */}
      <ActionMenu groups={groups} selectable={selectable} cursor={cursor} />

      {/* Matched child page */}
      {children}

      {/* 3-line spacer before footer */}
      <Box height={3} />

      {/* Key hints + Version */}
      <KeyHints />
      <VersionBar />
    </Box>
  );
}
