// KeyHints.tsx — Key hint bar.
// Always shows navigation hints; back key is always visible (Esc/⌫/h → goBack via router).
import { Text } from 'ink';

export function KeyHints(): React.ReactElement {
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
