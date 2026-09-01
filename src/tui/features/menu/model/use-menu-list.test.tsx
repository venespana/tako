// use-menu-list.test.tsx — Unit tests for the menu interaction hook:
// cursor movement (arrows/j/k, wrapping) and selection (Enter/l), guarded
// against an empty list. The probe renders the cursor so frames assert it.
// Keypresses wait for their expected frame (a fresh page's first frame can
// paint before Ink's useInput effect subscribes — keys would be dropped).
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';

import { useMenuList } from './use-menu-list.js';
import type { UseMenuListOptions } from './use-menu-list.js';
import type { ActionItem } from './menu-items.js';

const fakeItem = (id: string): ActionItem => ({ id, label: id, command: id, kind: 'action' });

function Probe({ selectable, onSelect }: UseMenuListOptions): React.ReactElement {
  const { cursor } = useMenuList({ selectable, onSelect });
  return <Text>cursor={cursor}</Text>;
}

type RenderResult = ReturnType<typeof render>;

const wait = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

/** Poll until predicate(frame) holds or the timeout elapses. */
async function settle(
  lastFrame: RenderResult['lastFrame'],
  predicate: (frame: string) => boolean,
  timeoutMs: number
): Promise<string> {
  let frame = lastFrame() ?? '';
  for (let waited = 0; !predicate(frame) && waited < timeoutMs; waited += 10) {
    await wait(10);
    frame = lastFrame() ?? '';
  }
  return frame;
}

/** Write a key and wait until the expected frame change is visible. */
async function pressAndSettle(
  stdin: RenderResult['stdin'],
  lastFrame: RenderResult['lastFrame'],
  key: string,
  expectFrame: (frame: string) => boolean
): Promise<string> {
  let frame = '';
  for (let attempt = 0; attempt < 2 && !expectFrame(frame); attempt++) {
    stdin.write(key);
    frame = await settle(lastFrame, expectFrame, 350);
  }
  return frame;
}

const ITEMS = [fakeItem('a'), fakeItem('b'), fakeItem('c')];

describe('useMenuList', () => {
  it('starts the cursor at 0', async () => {
    const { lastFrame, unmount } = render(<Probe selectable={ITEMS} onSelect={vi.fn()} />);
    const frame = await settle(lastFrame, f => f.includes('cursor='), 1000);

    expect(frame).toContain('cursor=0');
    unmount();
  });

  it('moves the cursor down with j and the down arrow', async () => {
    const { stdin, lastFrame, unmount } = render(<Probe selectable={ITEMS} onSelect={vi.fn()} />);
    await settle(lastFrame, f => f.includes('cursor=0'), 1000);

    await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('cursor=1'));
    const frame = await pressAndSettle(stdin, lastFrame, '\x1b[B', f => f.includes('cursor=2'));
    expect(frame).toContain('cursor=2');
    unmount();
  });

  it('moves the cursor up with k and the up arrow', async () => {
    const { stdin, lastFrame, unmount } = render(<Probe selectable={ITEMS} onSelect={vi.fn()} />);
    await settle(lastFrame, f => f.includes('cursor=0'), 1000);

    await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('cursor=1'));
    await pressAndSettle(stdin, lastFrame, 'k', f => f.includes('cursor=0'));
    // up arrow wraps from the first to the last item
    const frame = await pressAndSettle(stdin, lastFrame, '\x1b[A', f => f.includes('cursor=2'));
    expect(frame).toContain('cursor=2');
    unmount();
  });

  it('wraps from the last item to the first on down', async () => {
    const { stdin, lastFrame, unmount } = render(<Probe selectable={ITEMS} onSelect={vi.fn()} />);
    await settle(lastFrame, f => f.includes('cursor=0'), 1000);

    await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('cursor=1'));
    await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('cursor=2'));
    const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('cursor=0') && !f.includes('cursor=2'));
    expect(frame).toContain('cursor=0');
    unmount();
  });

  it('selects the focused item on Enter and l', async () => {
    const onSelect = vi.fn();
    const { stdin, lastFrame, unmount } = render(<Probe selectable={ITEMS} onSelect={onSelect} />);
    await settle(lastFrame, f => f.includes('cursor=0'), 1000);

    stdin.write('\r');
    await wait(50);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(ITEMS[0]);

    stdin.write('j');
    await settle(lastFrame, f => f.includes('cursor=1'), 350);
    stdin.write('l');
    await wait(50);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
    unmount();
  });

  it('ignores movement and selection on an empty list', async () => {
    const onSelect = vi.fn();
    const { stdin, lastFrame, unmount } = render(<Probe selectable={[]} onSelect={onSelect} />);
    await settle(lastFrame, f => f.includes('cursor=0'), 1000);

    stdin.write('j');
    stdin.write('k');
    stdin.write('\r');
    await wait(50);

    expect(onSelect).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('cursor=0');
    unmount();
  });
});
