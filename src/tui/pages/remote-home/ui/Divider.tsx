// Divider.tsx — a single dim horizontal rule separating sections of the
// Remote Home screen.
import { Box } from 'ink';

import { theme } from '../../../shared/ui/theme.js';

/** A single dim horizontal rule: a bottom-border-only box (Ink enables all
 * four borders from `borderStyle` alone, so the other three are disabled). */
export function Divider(): React.ReactElement {
  return (
    <Box
      alignSelf='stretch'
      borderBottom
      borderLeft={false}
      borderRight={false}
      borderStyle='single'
      borderTop={false}
      borderColor={theme.disabledColor}
    />
  );
}
