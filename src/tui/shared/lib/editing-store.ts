// editing-store.ts — Tracks whether a text input is currently active.
// When true, global key handlers (useGlobalKeys) disable themselves so that
// h/j/k/l characters reach the text input without being intercepted.
//
// Zustand module-scope store (9.20 — zero React contexts in the TUI): the
// setter is identity-stable by construction and there is no provider, so the
// 9.10 context-value-instability class cannot exist here. Tests reset the
// singleton with useEditingStore.setState({ isEditing: false }).
import { create } from 'zustand';

export interface EditingState {
  isEditing: boolean;
  setEditing: (value: boolean) => void;
}

export const useEditingStore = create<EditingState>(set => ({
  isEditing: false,
  setEditing: value => {
    set({ isEditing: value });
  },
}));
