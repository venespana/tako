// KeyHints.tsx — The ONLY surface for key hints (9.15a): everything a screen
// advertises renders here, in the footer. Pages publish a semantic hint list
// into the shared page-hints store; AppShell hands it down as props — this
// widget stays dumb. Hints render LEFT-TO-RIGHT in declared order, and
// `back`/`quit` ALWAYS come last (they are available everywhere). Screens
// that publish no hints keep the classic layout: menu screens show the
// movement + select hints, command pages show back/quit only.
import { Text } from 'ink';

import type { KeyHint } from '../../../shared/lib/page-hints-store.js';

export interface KeyHintsProps {
  /** Whether the current screen shows a selectable list (menu pages). */
  selectableItems: boolean;
  /** The active page's hints, rendered left-to-right before back/quit. */
  hints?: readonly KeyHint[];
  /**
   * When true (forms), `back`/`quit` are suppressed: character keys belong to
   * data entry and Esc is the form's cancel — advertising them would be dead
   * keys (9.15 maintainer correction).
   */
  formMode?: boolean;
}

export function KeyHints({ selectableItems, hints = [], formMode = false }: KeyHintsProps): React.ReactElement {
  return (
    <Text dimColor>
      {hints.map(hint => (
        <Text key={`${hint.key} ${hint.label}`}>
          <Text bold>{hint.key}</Text>
          {` ${hint.label}  `}
        </Text>
      ))}
      {hints.length === 0 && selectableItems && !formMode && (
        <Text>
          {'↑↓/j k  '}
          <Text bold>Enter/l</Text>
          {' select  '}
        </Text>
      )}
      {!formMode && (
        <Text>
          <Text bold>h/Esc</Text>
          {' back  '}
          <Text bold>q</Text>
          {' quit'}
        </Text>
      )}
    </Text>
  );
}
