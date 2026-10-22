// CursorColumn.tsx — the 2-char cursor column shared by the Remote Home
// list and action rows: the theme glyph on the focused row, two spaces
// elsewhere.
import { Text } from 'ink';

import { theme } from '../../../shared/ui/theme.js';

/** 2-char cursor column: the theme glyph on the statically focused row,
 * two spaces elsewhere. */
export function CursorColumn({ focused }: { focused: boolean }): React.ReactElement {
  return focused ? <Text color={theme.cursorColor}>{`${theme.cursorGlyph} `}</Text> : <Text>{'  '}</Text>;
}
