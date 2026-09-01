// index.ts — Public API of the menu feature slice (FSD rule 4-2).
// External consumers must import from here, never from slice internals.

export type { ActionGroup, ActionItem, ActionItemKind, EnableCondition, ScreenProps } from './model/menu-items.js';
export { getSelectable, moveCursor } from './model/menu-navigation.js';
export { getRegistry } from './model/menu-registry.js';
export { getSelectableForRoute, isMenuNavigableRoute } from './model/menu-flow.js';
export type { MenuFlow } from './model/menu-flow.js';
