// AppShell.tsx — Root layout widget: the persistent chrome. The
// ASCII logo header is ALWAYS rendered (the old showLogo policy is gone).
// Below it, stacked (9.14a — no longer beside the logo), rides the active
// remote line: `homeserver · agent 0.2.0 (active)` once the workspace's
// handshake has reported a version, or just the name until then (session
// state arrives as props — the shell never imports app/). The matched route
// renders exactly one screen in the Outlet, and the footer shows the
// contextual key hints plus the version. Global keys (quit/back) are wired
// here; everything screen-specific lives in pages. The router renders it via
// app/routes/layout.tsx.
import { Box, Text } from 'ink';

import { Outlet, useMatches } from 'react-router';

import { KeyHints } from './KeyHints.js';
import { Logo } from './Logo.js';
import { VersionBar } from './VersionBar.js';
import { usePageHintsStore } from '../../../shared/lib/page-hints-store.js';
import { hasMenuHandle } from '../../../shared/lib/route-tree.js';
import { useGlobalKeys } from '../../../shared/lib/use-global-keys.js';

export interface AppShellProps {
  /** Name of the session's selected remote (undefined until one is selected). */
  activeRemote?: string;
  /** Agent version the active remote's handshake reported (undefined until known). */
  agentVersion?: string;
}

export function AppShell({ activeRemote, agentVersion }: AppShellProps): React.ReactElement {
  useGlobalKeys();
  const matches = useMatches();
  // 9.15a: the active page's key hints (default: none — command pages then
  // show back/quit only). 9.15c: formMode suppresses back/quit in the footer
  // (dead keys while a form owns the keyboard).
  const hints = usePageHintsStore(state => state.hints);
  const formMode = usePageHintsStore(state => state.formMode);

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
      <Box flexDirection='column' alignItems='flex-start' flexShrink={0}>
        <Logo />
        {/* Subtle chrome (9.14a): the active remote rides BELOW the logo so
         * it stays visible on every screen of the session without sitting
         * beside the ASCII art. */}
        {activeRemote !== undefined && (
          <Text color='cyan' dimColor>
            {agentVersion !== undefined ? `${activeRemote} · agent ${agentVersion} (active)` : activeRemote}
          </Text>
        )}
      </Box>
      <Box flexDirection='column' flexGrow={1} overflow='hidden'>
        <Box flexDirection='column' flexShrink={0}>
          <Outlet />
        </Box>
      </Box>
      <Box flexDirection='column' paddingLeft={2} flexShrink={0}>
        <KeyHints selectableItems={hasMenuHandle(matches)} hints={hints} formMode={formMode} />
        <VersionBar />
      </Box>
    </Box>
  );
}
