// AppShell.tsx — Root layout widget: the persistent chrome. The
// ASCII logo header is ALWAYS rendered (the old showLogo policy is gone),
// with the selected remote's name beside it whenever a remote is active
// (session state arrives as a prop — the shell never imports app/). The
// matched route renders exactly one screen in the Outlet, and the footer
// shows the contextual key hints plus the version. Global keys (quit/back)
// are wired here; everything screen-specific lives in pages. The router
// renders it via app/routes/layout.tsx.
import { Box, Text } from 'ink';

import { Outlet, useMatches } from 'react-router';

import { KeyHints } from './KeyHints.js';
import { Logo } from './Logo.js';
import { VersionBar } from './VersionBar.js';
import { hasMenuHandle } from '../../../shared/lib/route-tree.js';
import { useGlobalKeys } from '../../../shared/lib/use-global-keys.js';

export interface AppShellProps {
  /** Name of the session's selected remote (undefined until one is selected). */
  activeRemote?: string;
}

export function AppShell({ activeRemote }: AppShellProps): React.ReactElement {
  useGlobalKeys();
  const matches = useMatches();

  return (
    // Root owns the vertical budget: exactly one viewport tall. Header takes
    // its natural height, the Outlet fills the remainder via flexGrow (so the
    // footer sits at the bottom), and the footer takes its natural height.
    <Box flexDirection='column' height={process.stdout.rows ?? 40}>
      <Box flexDirection='row' alignItems='flex-end'>
        <Logo />
        {/* Subtle chrome: the active server name rides beside the logo so it
         * stays visible on every screen of the session. */}
        {activeRemote !== undefined && (
          <Text color='cyan' dimColor>
            {' '}
            {activeRemote}
          </Text>
        )}
      </Box>
      <Box flexDirection='column' flexGrow={1}>
        <Outlet />
      </Box>
      <Box flexDirection='column' paddingLeft={2}>
        <KeyHints selectableItems={hasMenuHandle(matches)} />
        <VersionBar />
      </Box>
    </Box>
  );
}
