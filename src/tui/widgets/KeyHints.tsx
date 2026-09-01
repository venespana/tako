// KeyHints.tsx — Contextual key hint bar. Menu screens (route handle
// declares a menu) show the full movement + select hints; command pages
// show back/quit only. Back/quit are available everywhere. AppShell derives
// the flag from the match chain and passes it in — this widget stays dumb.
import { Text } from 'ink';

export interface KeyHintsProps {
  /** Whether the current screen shows a selectable list (menu pages). */
  selectableItems: boolean;
}

export function KeyHints({ selectableItems }: KeyHintsProps): React.ReactElement {
  if (!selectableItems) {
    return (
      <Text dimColor={true}>
        <Text bold>h/Esc</Text>
        {' back  '}
        <Text bold>q</Text>
        {' quit'}
      </Text>
    );
  }

  return (
    <Text dimColor={true}>
      {'↑↓/j k  '}
      <Text bold>Enter/l</Text>
      {' select  '}
      <Text bold>h/Esc</Text>
      {' back  '}
      <Text bold>q</Text>
      {' quit'}
    </Text>
  );
}
