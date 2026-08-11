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
    <Box flexDirection='column' justifyContent='space-between' alignItems='center' height={process.stdout.rows}>
      {/* Top section with Logo */}
      <Box flexDirection='column' alignItems='center'>
        <Logo />
      </Box>

      {/* Middle section: Menu aligned to the RIGHT */}
      <Box flexDirection='column' alignItems='flex-end' justifyContent='center'>
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={view} />
      </Box>

      {/* Bottom section: Key hints + Version */}
      <Box flexDirection='column' alignItems='center' gap={1}>
        <KeyHints view={view} />
        <VersionBar />
      </Box>
    </Box>
  );
}
