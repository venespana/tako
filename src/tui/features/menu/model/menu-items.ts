// menu-items.ts — Menu item model: the item/group/enablement types shared by
// every part of the menu feature (registry, navigation, submenu building).

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
  /** Target path (e.g. '/remotes/list') when kind === 'submenu'; also used by
   * action items that navigate. A plain path string on purpose: features stay
   * decoupled from the route tree; the router simply does not match unknown
   * paths. */
  route?: string;
}

/** A named group of ActionItems rendered together */
export interface ActionGroup {
  id: string;
  label: string;
  items: ActionItem[];
}

/**
 * Feature-side gating result: an ActionItem with its enablement pre-computed
 * (withEnablement). The ActionMenu widget owns the render-ready contract
 * (RenderableActionGroup, ADR-0018 point 6); pages hand this shape to the
 * widget — it is structurally compatible.
 */
export interface GatedActionItem extends ActionItem {
  /** Pre-computed by the menu feature (withEnablement): true when the item
   * passes the gating rule and is part of the selectable list. */
  enabled: boolean;
}

/** Gated group: same label structure, items carry `enabled`. */
export interface GatedActionGroup {
  id: string;
  label: string;
  items: GatedActionItem[];
}
