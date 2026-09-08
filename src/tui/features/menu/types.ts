// types.ts — Shared types for the menu feature.

// ---------------------------------------------------------------------------
// View State Machine
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
  /** Key looked up in the DispatchMap at runtime */
  handlerKey?: string;
  /** Target path for route-based navigation */
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
