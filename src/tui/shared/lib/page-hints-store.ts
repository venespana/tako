// page-hints-store.ts — Publishes the ACTIVE page's footer key hints to the
// shell (9.15a): every key hint renders ONLY in the footer KeyHints bar,
// left-to-right in the order the page declares, with back/quit always last
// (KeyHints appends them).
//
// `formMode` (9.15c): while a form is open, character keys are data entry and
// the global back/quit keys are dead (EditingGuard blocks them) — the shell
// suppresses back/quit in the footer and the form publishes its own hints
// (enter submit, esc cancel).
//
// Mechanism (9.20 — zero React contexts in the TUI): a zustand module-scope
// store. Hints are DYNAMIC view state — they change with page mode (browse
// vs form) and panel phase (install running vs failed) — so the route
// `handle`/useMatches path, which carries static route metadata, does not
// fit, and threading a per-page prop through every layout shim would touch
// every route for one opt-in concern. Pages and features opt in by calling
// usePageHints (effects only — never setState during render); AppShell reads
// the store with selectors in the widgets layer and hands the values to the
// dumb KeyHints widget as props. Import direction stays legal:
// pages/features → shared, widgets → shared, and the shell never imports
// app/.
// HARD RULE: exactly ONE writer per mounted surface — a nested usePageHints
// would let a child cleanup clobber the parent's published hints.
import { useEffect } from 'react';

import { create } from 'zustand';

/** One semantic footer hint: the key legend and its action label. */
export interface KeyHint {
  readonly key: string;
  readonly label: string;
}

export interface PageHintsState {
  readonly hints: readonly KeyHint[];
  readonly formMode: boolean;
  setHints: (hints: readonly KeyHint[], formMode?: boolean) => void;
}

export const usePageHintsStore = create<PageHintsState>((set, get) => ({
  hints: [],
  formMode: false,
  setHints: (hints, formMode = false) => {
    // Identity-preserving publication: republishing the SAME list (and mode)
    // must not re-render subscribers (9.10 lesson).
    const current = get();
    if (current.hints === hints && current.formMode === formMode) return;
    set({ hints, formMode });
  },
}));

/**
 * Declare the current page's hints while mounted (cleanup clears them).
 * `hints` must be identity-stable across renders — a module constant or
 * useMemo — because it is an effect dependency; a fresh literal per render
 * would re-publish on every render (9.10 lesson).
 */
export function usePageHints(hints: readonly KeyHint[], formMode = false): void {
  const setHints = usePageHintsStore(state => state.setHints);
  useEffect(() => {
    setHints(hints, formMode);
    return () => setHints([]);
  }, [setHints, hints, formMode]);
}
