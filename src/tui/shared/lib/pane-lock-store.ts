// pane-lock-store.ts — Tracks whether a pane lock currently owns the
// keyboard (e.g. the remote-home hub's ACTIONS pane). When true, global key
// handlers (useGlobalKeys) suppress their BACK bindings (Esc/h/⌫) so
// unlocking a pane never also navigates away; quit (q / Ctrl-C) stays live.
//
// Zustand module-scope store (9.20 — zero React contexts in the TUI): the
// setter is identity-stable by construction and there is no provider, so the
// 9.10 context-value-instability class cannot exist here. Tests reset the
// singleton with usePaneLockStore.setState({ locked: false }).
import { create } from 'zustand';

export interface PaneLockState {
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

export const usePaneLockStore = create<PaneLockState>(set => ({
  locked: false,
  setLocked: locked => {
    set({ locked });
  },
}));
