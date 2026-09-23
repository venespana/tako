// use-key-bindings.test.tsx — Unit tests for the shared key-bindings hook
// (task 9.9): each trigger fires, isActive gates everything, exact
// single-char matching (multi-char input ignored), and the documented
// dispatch precedence. Keypresses settle before assertions (a fresh page's
// first frame can paint before Ink's useInput effect subscribes).
import { describe, expect, it, vi } from 'vitest';

import { Text } from 'ink';
import { render } from 'ink-testing-library';

import { settle, wait } from '../../test-utils/ink-interactions.js';
import { useKeyBindings } from './use-key-bindings.js';
import type { KeyBindings } from './use-key-bindings.js';

function Probe({ bindings, isActive }: { bindings: KeyBindings; isActive?: boolean }): React.ReactElement {
  useKeyBindings(bindings, { isActive });
  return <Text>ready</Text>;
}

/** Render the probe and wait until its first frame is committed. */
async function renderProbe(bindings: KeyBindings, isActive?: boolean) {
  const instance = render(<Probe bindings={bindings} isActive={isActive} />);
  await settle(instance.lastFrame, frame => frame.includes('ready'), 1000);
  return instance;
}

const ESCAPE = '\x1b';
const UP = '\x1b[A';
const DOWN = '\x1b[B';
const RETURN = '\r';

describe('useKeyBindings — trigger dispatch (9.9)', () => {
  it('RED: moveUp fires on the up arrow and on k', async () => {
    const moveUp = vi.fn();
    const { stdin, unmount } = await renderProbe({ moveUp });

    stdin.write('k');
    await wait(50);
    expect(moveUp).toHaveBeenCalledTimes(1);

    stdin.write(UP);
    await wait(50);
    expect(moveUp).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('RED: moveDown fires on the down arrow and on j', async () => {
    const moveDown = vi.fn();
    const { stdin, unmount } = await renderProbe({ moveDown });

    stdin.write('j');
    await wait(50);
    expect(moveDown).toHaveBeenCalledTimes(1);

    stdin.write(DOWN);
    await wait(50);
    expect(moveDown).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('9.9: confirm fires on return ONLY — l is not a built-in confirm (sites declare it in chars)', async () => {
    const confirm = vi.fn();
    const { stdin, unmount } = await renderProbe({ confirm });

    stdin.write(RETURN);
    await wait(50);
    expect(confirm).toHaveBeenCalledTimes(1);

    stdin.write('l');
    await wait(50);
    expect(confirm).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('RED: cancel fires on escape', async () => {
    const cancel = vi.fn();
    const { stdin, unmount } = await renderProbe({ cancel });

    stdin.write(ESCAPE);
    await wait(50);
    expect(cancel).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('RED: tab and shiftTab fire on Tab with and without Shift', async () => {
    const tab = vi.fn();
    const shiftTab = vi.fn();
    const { stdin, unmount } = await renderProbe({ tab, shiftTab });

    stdin.write('\t');
    await wait(50);
    expect(tab).toHaveBeenCalledTimes(1);
    expect(shiftTab).not.toHaveBeenCalled();

    // ZSHT (Shift-Tab) escape sequence as parsed by Ink.
    stdin.write('\x1b[Z');
    await wait(50);
    expect(shiftTab).toHaveBeenCalledTimes(1);
    expect(tab).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('RED: ctrlC fires on Ctrl-C only (plain c is just a char)', async () => {
    const ctrlC = vi.fn();
    const chars = { c: vi.fn() };
    const { stdin, unmount } = await renderProbe({ ctrlC, chars });

    stdin.write('c');
    await wait(50);
    expect(chars.c).toHaveBeenCalledTimes(1);
    expect(ctrlC).not.toHaveBeenCalled();

    stdin.write('\x03');
    await wait(50);
    expect(ctrlC).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('RED: backspace fires on the backspace key', async () => {
    const backspace = vi.fn();
    const { stdin, unmount } = await renderProbe({ backspace });

    stdin.write('\x7f');
    await wait(50);
    expect(backspace).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('RED: an unbound key fires nothing', async () => {
    const confirm = vi.fn();
    const chars = { x: vi.fn() };
    const { stdin, unmount } = await renderProbe({ confirm, chars });

    stdin.write('q');
    stdin.write(DOWN);
    await wait(60);

    expect(confirm).not.toHaveBeenCalled();
    expect(chars.x).not.toHaveBeenCalled();
    unmount();
  });
});

describe('useKeyBindings — char handling (9.9)', () => {
  it('RED: exact single characters fire their binding', async () => {
    const chars = { n: vi.fn(), '1': vi.fn() };
    const { stdin, unmount } = await renderProbe({ chars });

    stdin.write('n');
    await wait(50);
    expect(chars.n).toHaveBeenCalledTimes(1);

    stdin.write('1');
    await wait(50);
    expect(chars['1']).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('RED: multi-character input is ignored (no per-char split)', async () => {
    const chars = { x: vi.fn(), y: vi.fn() };
    const { stdin, unmount } = await renderProbe({ chars });

    stdin.write('xy');
    await wait(50);

    expect(chars.x).not.toHaveBeenCalled();
    expect(chars.y).not.toHaveBeenCalled();
    unmount();
  });
});

describe('useKeyBindings — gating and precedence (9.9)', () => {
  it('RED: isActive false makes the hook a full no-op', async () => {
    const bindings: KeyBindings = {
      moveUp: vi.fn(),
      moveDown: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
      chars: { q: vi.fn() },
    };
    const { stdin, unmount } = await renderProbe(bindings, false);

    stdin.write('k');
    stdin.write('j');
    stdin.write(RETURN);
    stdin.write(ESCAPE);
    stdin.write('q');
    await wait(80);

    expect(bindings.moveUp).not.toHaveBeenCalled();
    expect(bindings.moveDown).not.toHaveBeenCalled();
    expect(bindings.confirm).not.toHaveBeenCalled();
    expect(bindings.cancel).not.toHaveBeenCalled();
    expect(bindings.chars?.q).not.toHaveBeenCalled();
    unmount();
  });

  it('RED: anyKey takes over — every key fires it and other bindings are skipped', async () => {
    const anyKey = vi.fn();
    const moveUp = vi.fn();
    const { stdin, unmount } = await renderProbe({ anyKey, moveUp });

    stdin.write('z');
    await wait(50);
    expect(anyKey).toHaveBeenCalledTimes(1);

    stdin.write('k');
    await wait(50);
    expect(anyKey).toHaveBeenCalledTimes(2);
    expect(moveUp).not.toHaveBeenCalled();
    unmount();
  });

  it('RED: an empty binding set is a no-op (every key still flows through)', async () => {
    const { stdin, unmount } = await renderProbe({});

    stdin.write('k');
    stdin.write('\t');
    await wait(60);
    unmount();
  });
});
