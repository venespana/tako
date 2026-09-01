// AppShell.tsx — Root layout route component: app-wide keyboard wiring, the
// viewport-height budget, and the logo conditional. The router renders it via
// routes/layout.tsx; every screen mounts inside its Outlet with the active
// menu flow as outlet context.
import { Box } from 'ink';

import { Outlet, useMatches } from 'react-router';

import { useAppRuntime } from './app-runtime.js';
import { useMenuKeyboard } from './use-menu-keyboard.js';
import type { ScreenProps } from '../features/menu/index.js';
import { hasShowLogo } from '../shared/lib/route-tree.js';
import { Logo } from '../widgets/Logo.js';

export function AppShell(): React.ReactElement {
  const { hasActiveRemote } = useAppRuntime();
  const matches = useMatches();
  const { groups, selectable, cursor } = useMenuKeyboard({ hasActiveRemote });

  const screen: ScreenProps = { groups, selectable, cursor };

  return (
    // Root owns the vertical budget: exactly one viewport tall.
    // Logo takes its natural height; the Outlet fills the remainder via flexGrow.
    // This keeps logo + screen == terminal height (no overflow, no clipped logo).
    <Box flexDirection='column' height={process.stdout.rows ?? 40}>
      {hasShowLogo(matches) && <Logo />}
      <Outlet context={screen} />
    </Box>
  );
}
