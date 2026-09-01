// index.ts — Public API of the menu feature slice (FSD rule 4-2).
// External consumers must import from here, never from slice internals.

export type { ActionGroup, ActionItem, ActionItemKind, EnableCondition, ScreenProps } from './types.js';
export { getSelectable, moveCursor } from './navigation.js';
export { getRegistry } from './registry.js';
export { getSelectableForRoute, isMenuNavigableRoute } from './menu-flow.js';
export type { MenuFlow } from './menu-flow.js';
