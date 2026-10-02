// index.ts — Public API of the menu feature slice (FSD rule 4-2).
// External consumers must import from here, never from slice internals.

export type {
  ActionGroup,
  ActionItem,
  ActionItemKind,
  EnableCondition,
  GatedActionGroup,
  GatedActionItem,
} from './model/menu-items.js';
export { getSelectable, moveCursor, withEnablement } from './model/menu-navigation.js';
export { getRegistry } from './model/menu-registry.js';
export { buildRemotesSelectable, getRemotesSelectable, getRemotesGroups } from './model/menu-submenu.js';
export { useMenuList } from './model/use-menu-list.js';
export type { UseMenuListOptions, MenuListController } from './model/use-menu-list.js';
export { useMenuNavigation } from './model/use-menu-navigation.js';
