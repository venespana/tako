// use-global-keys.test.tsx — Global-key behavior: linear back (Esc/h/⌫ →
// navigate(-1), or exit at the root), quit (q / Ctrl-C), and the pane-lock
// precedence: while a page's pane lock holds, the back keys are suppressed
// (the locked page owns them for its unlock) but quit keeps working.
import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePaneLockStore } from './pane-lock-store.js';
import { useGlobalKeys } from './use-global-keys.js';
import { wait } from '../../test-utils/ink-interactions.js';

const exitSpy = vi.hoisted(() => vi.fn());

vi.mock('ink', async importOriginal => {
  // Spread the REAL module so useInput keeps working; only useApp is
  // replaced — its exit() is the observable of quit and back-at-root.
  const actual = await importOriginal<typeof import('ink')>();
  return { ...actual, useApp: () => ({ exit: exitSpy }) };
});

function LocationProbe(): React.ReactElement {
  const location = useLocation();
  useGlobalKeys();

  return <Text>{`at:${location.pathname}`}</Text>;
}

const renderProbe = (initialEntries: string[]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe />
    </MemoryRouter>
  );

const ESCAPE = '\x1b';
const BACKSPACE = '\x7f';

describe('useGlobalKeys — unlocked (behavior unchanged)', () => {
  beforeEach(() => {
    exitSpy.mockClear();
    usePaneLockStore.setState({ locked: false });
  });

  it('Esc goes back one history entry', async () => {
    const { stdin, lastFrame, unmount } = renderProbe(['/elsewhere', '/deep']);

    await wait(50);
    stdin.write(ESCAPE);
    await wait(50);

    expect(lastFrame() ?? '').toContain('at:/elsewhere');
    expect(exitSpy).not.toHaveBeenCalled();
    unmount();
  });

  it('Esc at the root exits (nothing to pop)', async () => {
    const { stdin, unmount } = renderProbe(['/']);

    await wait(50);
    stdin.write(ESCAPE);
    await wait(50);

    expect(exitSpy).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('h goes back like Esc', async () => {
    const { stdin, lastFrame, unmount } = renderProbe(['/elsewhere', '/deep']);

    await wait(50);
    stdin.write('h');
    await wait(50);

    expect(lastFrame() ?? '').toContain('at:/elsewhere');
    unmount();
  });

  it('backspace goes back like Esc', async () => {
    const { stdin, lastFrame, unmount } = renderProbe(['/elsewhere', '/deep']);

    await wait(50);
    stdin.write(BACKSPACE);
    await wait(50);

    expect(lastFrame() ?? '').toContain('at:/elsewhere');
    unmount();
  });

  it('q quits from anywhere', async () => {
    const { stdin, unmount } = renderProbe(['/elsewhere', '/deep']);

    await wait(50);
    stdin.write('q');
    await wait(50);

    expect(exitSpy).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe('useGlobalKeys — pane lock precedence (iteration 3 correction)', () => {
  beforeEach(() => {
    exitSpy.mockClear();
    usePaneLockStore.setState({ locked: true });
  });

  it('Esc is suppressed: no navigation, no exit', async () => {
    const { stdin, lastFrame, unmount } = renderProbe(['/elsewhere', '/deep']);

    await wait(50);
    stdin.write(ESCAPE);
    await wait(50);

    expect(lastFrame() ?? '').toContain('at:/deep');
    expect(exitSpy).not.toHaveBeenCalled();
    unmount();
  });

  it('h and backspace are suppressed too', async () => {
    const { stdin, lastFrame, unmount } = renderProbe(['/elsewhere', '/deep']);

    await wait(50);
    stdin.write('h');
    stdin.write(BACKSPACE);
    await wait(60);

    expect(lastFrame() ?? '').toContain('at:/deep');
    expect(exitSpy).not.toHaveBeenCalled();
    unmount();
  });

  it('q still quits while locked (quit wins always)', async () => {
    const { stdin, unmount } = renderProbe(['/elsewhere', '/deep']);

    await wait(50);
    stdin.write('q');
    await wait(50);

    expect(exitSpy).toHaveBeenCalledTimes(1);
    unmount();
  });
});
