// pane-lock-store.test.ts — Store behavior for the pane-lock flag: the
// singleton starts unlocked, setLocked flips it, and tests reset it via
// setState (the editing-store pattern).
import { beforeEach, describe, expect, it } from 'vitest';

import { usePaneLockStore } from './pane-lock-store.js';

describe('usePaneLockStore', () => {
  beforeEach(() => {
    usePaneLockStore.setState({ locked: false });
  });

  it('starts unlocked', () => {
    expect(usePaneLockStore.getState().locked).toBe(false);
  });

  it('locks and unlocks through setLocked', () => {
    usePaneLockStore.getState().setLocked(true);

    expect(usePaneLockStore.getState().locked).toBe(true);

    usePaneLockStore.getState().setLocked(false);

    expect(usePaneLockStore.getState().locked).toBe(false);
  });

  it('keeps the setter identity-stable across publications (9.10 — no churn)', () => {
    const setter = usePaneLockStore.getState().setLocked;
    usePaneLockStore.getState().setLocked(true);

    expect(usePaneLockStore.getState().setLocked).toBe(setter);
  });
});
