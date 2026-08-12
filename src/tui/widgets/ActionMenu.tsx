// ActionMenu.tsx — Renders the menu groups and items with cursor glyph.
// Cursor: ❯ cyan on focused item only. Disabled items rendered greyed.
import { Box, Text } from 'ink';

import type { ActionGroup, ActionItem, ViewState } from '../features/menu/types.js';
import { theme } from '../shared/theme.js';

export interface ActionMenuProps {
  groups: ActionGroup[];
  /** Items that are currently selectable (pre-filtered) */
  selectable: ActionItem[];
  /** Index into selectable[] that is currently focused */
  cursor: number;
  /** Current view state */
  view: ViewState;
}

function isCursorPosition(
  groups: ActionGroup[],
  selectable: ActionItem[],
  cursor: number,
  gi: number,
  ii: number
): boolean {
  const focusedItem = selectable[cursor];
  if (!focusedItem) return false;
  const group = groups[gi];
  const item = group?.items[ii];
  if (!item) return false;
  return item.id === focusedItem.id;
}

export function ActionMenu({ groups, selectable, cursor, view }: ActionMenuProps): React.ReactElement {
  // In submenu view, render the subaction list
  if (view.view === 'submenu') {
    const parent = selectable[cursor];
    if (!parent || parent.kind !== 'submenu' || !parent.submenu) {
      return <Box />;
    }
    return (
      <Box flexDirection='column' gap={0}>
        {parent.submenu.map(label => (
          <Text key={label} dimColor={false}>
            {'  '}
            {label}
          </Text>
        ))}
      </Box>
    );
  }

  // In list view, render all groups with their items
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
            const isSelectable = item.enabledWhen !== 'hasActiveRemote' || selectable.includes(item);
            const isItemFocused = isCursorPosition(
              groups,
              selectable,
              cursor,
              groups.indexOf(group),
              group.items.indexOf(item)
            );

            if (isItemFocused) {
              return (
                <Text key={item.id}>
                  <Text color={theme.cursorColor}>{theme.cursorGlyph}</Text>
                  <Text> {item.label}</Text>
                </Text>
              );
            }

            return (
              <Text key={item.id} dimColor={!isSelectable} color={isSelectable ? undefined : theme.disabledColor}>
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
