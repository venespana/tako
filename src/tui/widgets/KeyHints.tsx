// KeyHints.tsx — View-aware key hint bar.
// Updates based on whether in list or submenu view.
import { Text } from 'ink';

import type { ViewState } from '../features/menu/types.js';

export interface KeyHintsProps {
  view: ViewState;
}

export function KeyHints({ view }: KeyHintsProps): React.ReactElement {
  return (
    <Text dimColor={true}>
      {'↑↓/j k  '}
      <Text bold>Enter/l</Text>
      {' select  '}
      {view.view === 'submenu' && (
        <>
          <Text bold>h/Esc</Text>
          {' back  '}
        </>
      )}
      <Text bold>q</Text>
      {' quit'}
    </Text>
  );
}
