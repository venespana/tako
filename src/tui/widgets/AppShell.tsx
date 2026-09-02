// AppShell.tsx — Root layout widget: the persistent chrome. The
// ASCII logo header is ALWAYS rendered (the old showLogo policy is gone),
// the matched route renders exactly one screen in the Outlet, and the
// footer shows the contextual key hints plus the version. Global keys
// (quit/back) are wired here; everything screen-specific lives in pages.
// The router renders it via app/routes/layout.tsx.
import { Box } from 'ink';

import { Outlet, useMatches } from 'react-router';

import { KeyHints } from './KeyHints.js';
import { Logo } from './Logo.js';
import { VersionBar } from './VersionBar.js';
import { hasMenuHandle } from '../shared/lib/route-tree.js';
import { useGlobalKeys } from '../shared/lib/use-global-keys.js';

export function AppShell(): React.ReactElement {
  useGlobalKeys();
  const matches = useMatches();

  return (
    // Root owns the vertical budget: exactly one viewport tall. Header takes
    // its natural height, the Outlet fills the remainder via flexGrow (so the
    // footer sits at the bottom), and the footer takes its natural height.
    <Box flexDirection='column' height={process.stdout.rows ?? 40}>
      <Logo />
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
