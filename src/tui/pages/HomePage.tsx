// HomePage.tsx — Composes the home screen: Logo + ActionMenu + KeyHints + VersionBar.
import { Box } from 'ink';

import type { ActionGroup, ActionItem, ViewState } from '../features/menu/types.js';
import { ActionMenu } from '../widgets/ActionMenu.js';
import { KeyHints } from '../widgets/KeyHints.js';
import { Logo } from '../widgets/Logo.js';
import { VersionBar } from '../widgets/VersionBar.js';

export interface HomePageProps {
  groups: ActionGroup[];
  selectable: ActionItem[];
  cursor: number;
  view: ViewState;
}

export function HomePage({ groups, selectable, cursor, view }: HomePageProps): React.ReactElement {
  return (
    <Box
      flexDirection='column'
      justifyContent='space-between'
      alignItems='flex-start'
      height={process.stdout.rows ?? 40}
      paddingLeft={2}
    >
      {/* Top section with Logo */}
      <Box flexDirection='column' alignItems='flex-start'>
        <Logo />
      </Box>

      {/* Middle section: Menu aligned to the LEFT */}
      <Box flexDirection='column' alignItems='flex-start' justifyContent='center'>
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={view} />
      </Box>

      {/* Bottom section: Key hints + Version */}
      <Box flexDirection='column' alignItems='flex-start' gap={1}>
        <KeyHints view={view} />
        <VersionBar />
      </Box>
    </Box>
  );
}
