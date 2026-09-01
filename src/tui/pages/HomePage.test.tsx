// HomePage.test.tsx — Unit tests for the home menu page. HomePage owns its
// list (registry groups + selectable + useMenuList); logo, key hints, and
// version are app-shell chrome and NOT part of this page. MemoryRouter
// supplies the router context useNavigate/useLocation need.
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { MemoryRouter } from 'react-router';

import { HomePage } from './HomePage.js';

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

/** Write a key and wait until the expected frame change is visible (a fresh
 * page's first frame can paint before Ink's useInput effect subscribes). */
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

const renderHome = (hasActiveRemote = false) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <HomePage hasActiveRemote={hasActiveRemote} />
    </MemoryRouter>
  );

describe('HomePage', () => {
  it('renders the registry groups and items', async () => {
    const { lastFrame } = renderHome();
    const frame = await settle(lastFrame, f => f.includes('Local'), 1000);

    expect(frame).toContain('Local');
    expect(frame).toContain('Remote');
    expect(frame).toContain('Config');
    expect(frame).toContain('doctor');
    expect(frame).toContain('remotes');
  });

  it('starts the cursor on the first selectable item (doctor)', async () => {
    const { lastFrame } = renderHome();
    const frame = await settle(lastFrame, f => f.includes('Local'), 1000);

    expect(frame).toContain('❯ doctor');
  });

  it('wraps movement within the gated selectable list (no active remote)', async () => {
    // hasActiveRemote=false: selectable = [doctor, remotes] — two j presses
    // wrap back to doctor instead of landing on the gated logs item.
    const { stdin, lastFrame } = renderHome(false);
    await settle(lastFrame, f => f.includes('❯ doctor'), 1000);

    const frame1 = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
    expect(frame1).toContain('❯ remotes');

    const frame2 = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ doctor') && !f.includes('❯ remotes'));
    expect(frame2).toContain('❯ doctor');
  });

  it('reaches gated items when a remote is active', async () => {
    const { stdin, lastFrame } = renderHome(true);
    await settle(lastFrame, f => f.includes('❯ doctor'), 1000);

    await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
    const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ logs'));
    expect(frame).toContain('❯ logs');
  });

  it('does not render shell chrome (logo, key hints, version)', async () => {
    const { lastFrame } = renderHome();
    const frame = await settle(lastFrame, f => f.includes('Local'), 1000);

    expect(frame).not.toContain('███╗');
    expect(frame).not.toContain('quit');
    expect(frame).not.toContain('v0.0.0');
  });
});
