// App.tsx — Root TUI component: router-driven screen renderer.
// App owns only wiring: it consumes the router instance, delegates keyboard
// input, cursor state, and menu derivation to useMenuKeyboard, and mounts the
// active screen. The route-aware menu model comes from the menu feature.
import { Box } from 'ink';

import { appRouter } from './app-router.js';
import { ROUTE_TABLE } from './routes.js';
import { useMenuKeyboard } from './use-menu-keyboard.js';
import { Logo } from '../widgets/Logo.js';

export interface AppProps {
  /** Whether a remote is currently configured. */
  hasActiveRemote?: boolean;
}

export default function App({ hasActiveRemote = false }: AppProps): React.ReactElement {
  const currentRoute = appRouter.useCurrentRoute();
  const { selectable, screenGroups, cursor } = useMenuKeyboard({ hasActiveRemote });

  // ROUTE_TABLE covers the whole RouteName union and isAppRoute guards menu
  // item routes, so the lookup is total — no fallback screen needed.
  const { Screen, showLogo } = ROUTE_TABLE[currentRoute];

  return (
    // Root owns the vertical budget: exactly one viewport tall.
    // Logo takes its natural height; the Screen fills the remainder via flexGrow.
    // This keeps logo + screen == terminal height (no overflow, no clipped logo).
    <Box flexDirection='column' height={process.stdout.rows ?? 40}>
      {showLogo && <Logo />}
      <Screen groups={screenGroups} selectable={selectable} cursor={cursor} />
    </Box>
  );
}
