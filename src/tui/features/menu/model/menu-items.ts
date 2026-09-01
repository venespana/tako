// menu-items.ts — Menu item model: the item/group/enablement types shared by
// every part of the menu feature (registry, navigation, route flow).

/** Condition that determines whether an item is selectable */
export type EnableCondition = 'always' | 'hasActiveRemote';

export type ActionItemKind = 'action' | 'submenu';

/** A single selectable/renderable menu item */
export interface ActionItem {
  /** Unique identifier within the registry */
  id: string;
  /** Label shown in the UI */
  label: string;
  /** Human-readable command name */
  command: string;
  /** Whether this item triggers an action or opens a submenu */
  kind: ActionItemKind;
  /** IDs of sub-action labels when kind === 'submenu' */
  submenu?: string[];
  /** When to show this item as enabled (selectable) */
  enabledWhen?: EnableCondition;
  /** Stable action identifier for kind === 'action' (command namespacing; the
   * old dispatch-map lookup was removed when routing replaced dispatching) */
  handlerKey?: string;
  /** Target route when kind === 'submenu'; also used by action items that navigate.
   * Untyped string on purpose (features must not import the app layer's route
   * union); the app narrows it via isAppRoute before navigating. */
  route?: string;
}

/** A named group of ActionItems rendered together */
export interface ActionGroup {
  id: string;
  label: string;
  items: ActionItem[];
}

/** Props every screen receives from the root component: the groups to render,
 * the pre-filtered selectable list, and the focused index into it. */
export interface ScreenProps {
  groups: ActionGroup[];
  selectable: ActionItem[];
  cursor: number;
}
