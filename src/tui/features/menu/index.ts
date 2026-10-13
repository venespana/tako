// index.ts — Public API of the menu feature slice (FSD rule 4-2).
// External consumers must import from here, never from slice internals.

export type { ActionItem } from './model/menu-items.js';
export { getSelectable, withEnablement } from './model/menu-navigation.js';
export { getRegistry } from './model/menu-registry.js';
export { useMenuList } from './model/use-menu-list.js';
export { useMenuNavigation } from './model/use-menu-navigation.js';
