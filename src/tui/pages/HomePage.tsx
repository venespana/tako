// HomePage.tsx — Composes the home screen: ActionMenu + KeyHints + VersionBar.
// Logo is rendered conditionally by App.tsx based on ROUTE_TABLE[route].showLogo.
import { Box } from 'ink';

import type { ScreenProps } from '../features/menu/index.js';
import { ActionMenu } from '../widgets/ActionMenu.js';
import { KeyHints } from '../widgets/KeyHints.js';
import { VersionBar } from '../widgets/VersionBar.js';

export function HomePage({ groups, selectable, cursor }: ScreenProps): React.ReactElement {
  return (
    // flexGrow=1: fill the space left by the Logo inside App's viewport-height root Box.
    // Never pin height to process.stdout.rows here — the root already owns that budget
    // and double-pinning pushes the logo off-screen (total = rows + logo height).
    <Box flexDirection='column' alignItems='flex-start' flexGrow={1} paddingLeft={2}>
      {/* 2-line spacer at top */}
      <Box height={2} />

      {/* Menu */}
      <ActionMenu groups={groups} selectable={selectable} cursor={cursor} />

      {/* 3-line spacer before footer */}
      <Box height={3} />

      {/* Key hints + Version */}
      <KeyHints />
      <VersionBar />
    </Box>
  );
}
