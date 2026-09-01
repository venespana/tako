// types.ts — Shared types for the menu feature.

// ---------------------------------------------------------------------------
// View State Machine (deprecated — router owns route; kept for helpers)
// ---------------------------------------------------------------------------

export type ViewState = { view: 'list' } | { view: 'submenu'; parentId: string; restoreCursor: number };

// ---------------------------------------------------------------------------
// Action Registry
// ---------------------------------------------------------------------------

export type ActionItemKind = 'action' | 'submenu';

/** Condition that determines whether an item is selectable */
export type EnableCondition = 'always' | 'hasActiveRemote';

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
  /** Key looked up in the DispatchMap at runtime (for kind === 'action') */
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

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Map from handlerKey (string) to an async handler function */
export type DispatchMap = Record<string, () => Promise<void>>;
