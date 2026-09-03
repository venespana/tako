// ActionMenu.tsx — Renders the menu groups and items with cursor glyph.
// Pure renderer: enablement arrives pre-computed on each item (`enabled`,
// evaluated by features/menu's withEnablement) and focus arrives as the
// focused item's id — the widget knows nothing about gating rules or cursor
// indices. Cursor: > cyan on the focused item only. Disabled items are
// rendered greyed.
import { Box, Text } from 'ink';

import type { RenderableActionGroup } from '../../../features/menu/index.js';
import { theme } from '../../../shared/ui/theme.js';

export interface ActionMenuProps {
  /** Render-ready groups: items carry a pre-computed `enabled` flag. */
  groups: RenderableActionGroup[];
  /** Id of the focused item (undefined = no focus, e.g. empty list). */
  focusedId: string | undefined;
}

export function ActionMenu({ groups, focusedId }: ActionMenuProps): React.ReactElement {
  return (
    <Box flexDirection='column' gap={1}>
      {groups.map(group => (
        <Box key={group.id} flexDirection='column' gap={0}>
          {/* Group label */}
          <Text bold dimColor={false}>
            {group.label}
          </Text>
          {/* Items */}
          {group.items.map(item => {
            if (item.id === focusedId) {
              return (
                <Text key={item.id}>
                  <Text color={theme.cursorColor}>{theme.cursorGlyph}</Text>
                  <Text> {item.label}</Text>
                </Text>
              );
            }

            return (
              <Text key={item.id} dimColor={!item.enabled} color={item.enabled ? undefined : theme.disabledColor}>
                {'  '}
                {item.label}
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
