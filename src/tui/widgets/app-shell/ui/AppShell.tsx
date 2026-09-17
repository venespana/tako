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
    // Root owns the vertical budget: exactly one viewport tall. Header and
    // footer keep their natural height (flexShrink 0), and the Outlet wrapper
    // crops its content instead of letting yoga shrink it: with a fixed
    // root height, yoga proportionally shrinks every descendant box, and
    // text elements whose shrunk height rounds to zero vanish line by line
    // (logo lines and menu group headers disappearing on short terminals).
    // The inner flexShrink-0 box keeps the page at its natural height while
    // the wrapper clips the overflow, so the top of the screen stays
    // anchored and only the bottom of the middle content is cropped.
    <Box flexDirection='column' height={process.stdout.rows ?? 40} overflow='hidden'>
      <Box flexDirection='row' alignItems='flex-end' flexShrink={0}>
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
      <Box flexDirection='column' flexGrow={1} overflow='hidden'>
        <Box flexDirection='column' flexShrink={0}>
          <Outlet />
        </Box>
      </Box>
      <Box flexDirection='column' paddingLeft={2} flexShrink={0}>
        <KeyHints selectableItems={hasMenuHandle(matches)} />
        <VersionBar />
      </Box>
    </Box>
  );
}
