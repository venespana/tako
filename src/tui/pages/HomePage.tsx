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
    <Box flexDirection='column' justifyContent='center' alignItems='center'>
      {/* Top spacer */}
      <Box />
      {/* ASCII Logo */}
      <Logo />
      {/* Spacer */}
      <Box />
      {/* Action Menu */}
      <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={view} />
      {/* Spacer */}
      <Box />
      {/* Key hints */}
      <KeyHints view={view} />
      {/* Version footer */}
      <VersionBar />
    </Box>
  );
}
