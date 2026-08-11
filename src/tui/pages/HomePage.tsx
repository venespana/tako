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
    <Box flexDirection='column' alignItems='flex-start' height={process.stdout.rows ?? 40} paddingLeft={2}>
      {/* 2-line spacer at top */}
      <Box height={2} />

      {/* Logo */}
      <Logo />

      {/* Menu */}
      <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={view} />

      {/* 3-line spacer before footer */}
      <Box height={3} />

      {/* Key hints + Version */}
      <KeyHints view={view} />
      <VersionBar />
    </Box>
  );
}
