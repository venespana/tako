// ActionMenu.tsx — Renders the menu groups and items with cursor glyph.
// Pure renderer over ITS OWN input contract (ADR-0018 point 6: the widget
// defines its input type; upper layers conform): render-ready groups whose
// items carry a pre-computed `enabled` flag — evaluated by the consumer's
// menu model (e.g. features/menu's withEnablement) — and focus arrives as
// the focused item's id. The widget knows nothing about gating rules, cursor
// indices, or menu semantics. Cursor: > cyan on the focused item only.
// Disabled items are rendered greyed.
import { Box, Text } from 'ink';

import { theme } from '../../../shared/ui/theme.js';

/** Render-ready menu item: exactly the fields ActionMenu renders, with the
 * enablement flag pre-computed by the upper layer that composes the menu. */
export interface RenderableActionItem {
  id: string;
  label: string;
  enabled: boolean;
}

/** Render-ready group: same label structure, items carry `enabled`. */
export interface RenderableActionGroup {
  id: string;
  label: string;
  items: RenderableActionItem[];
}

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
