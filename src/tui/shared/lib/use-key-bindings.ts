// use-key-bindings.ts — Shared-layer hook owning the TUI's key
// interpretation in ONE place (task 9.9): the arrow/vim movement triple
// (up/k, down/j), selection (return/l), escape, backspace, Tab navigation,
// Ctrl-C, and exact single-character bindings. Before this hook every
// component re-implemented `key.upArrow || input === 'k'`-style dispatch —
// duplicated across the menu list, the job list, and every page handler.
//
// Dispatch precedence (documented, tested): anyKey takes over a component's
// whole keyboard; then ctrl-c; then movement/selection/escape/backspace/tab;
// then exact single-character `chars` matches. Multi-character input (paste)
// is ignored — no per-character split. Unbound keys are no-ops.
//
// When `isActive` is false (e.g. during text input), the hook is a no-op so
// plain characters reach the text input without being intercepted.
import { useInput } from 'ink';

/** The full keyboard surface a TUI component can claim. */
export interface KeyBindings {
  /** ArrowUp or `k`. */
  moveUp?(): void;
  /** ArrowDown or `j`. */
  moveDown?(): void;
  /** Return or `l`. */
  confirm?(): void;
  /** Escape. */
  cancel?(): void;
  /** Backspace (no character payload). */
  backspace?(): void;
  /** Tab without Shift. */
  tab?(): void;
  /** Tab with Shift. */
  shiftTab?(): void;
  /** Ctrl-C (quit semantics live at the app level). */
  ctrlC?(): void;
  /** Exact single-character bindings; multi-character input never matches. */
  chars?: Record<string, () => void>;
  /** Any key event ("press any key" waiters) — disables all other bindings. */
  anyKey?(): void;
}

export interface UseKeyBindingsOptions {
  /** false makes the hook a full no-op. Default true. */
  isActive?: boolean;
}

export function useKeyBindings(bindings: KeyBindings, { isActive = true }: UseKeyBindingsOptions = {}): void {
  useInput(
    (input, key) => {
      if (bindings.anyKey !== undefined) {
        bindings.anyKey();
        return;
      }
      if (key.ctrl && input === 'c') {
        bindings.ctrlC?.();
        return;
      }
      if (key.upArrow || input === 'k') {
        bindings.moveUp?.();
        return;
      }
      if (key.downArrow || input === 'j') {
        bindings.moveDown?.();
        return;
      }
      if (key.return) {
        bindings.confirm?.();
        return;
      }
      if (key.escape) {
        bindings.cancel?.();
        return;
      }
      if (key.backspace) {
        bindings.backspace?.();
        return;
      }
      if (key.tab) {
        if (key.shift) bindings.shiftTab?.();
        else bindings.tab?.();
        return;
      }
      // Exact single characters only — multi-character input (paste) and
      // empty payloads never match a char binding.
      if (input.length === 1) bindings.chars?.[input]?.();
    },
    { isActive }
  );
}
