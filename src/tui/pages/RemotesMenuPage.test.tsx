// RemotesMenuPage.test.tsx — Unit tests for the remotes submenu page. The
// page owns its submenu list (feature-built groups + useMenuList); logo and
// footer are app-shell chrome. MemoryRouter supplies the router context.
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { MemoryRouter } from 'react-router';

import { RemotesMenuPage } from './RemotesMenuPage.js';

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

const renderRemotes = () =>
  render(
    <MemoryRouter initialEntries={['/remotes']}>
      <RemotesMenuPage />
    </MemoryRouter>
  );

describe('RemotesMenuPage', () => {
  it('renders the submenu list (all five subcommands)', async () => {
    const { lastFrame } = renderRemotes();
    const frame = await settle(lastFrame, f => f.includes('add'), 1000);

    expect(frame).toContain('remotes');
    expect(frame).toContain('add');
    expect(frame).toContain('list');
    expect(frame).toContain('rm');
    expect(frame).toContain('use');
    expect(frame).toContain('test');
  });

  it('starts the cursor on the first subcommand (add)', async () => {
    const { lastFrame } = renderRemotes();
    const frame = await settle(lastFrame, f => f.includes('add'), 1000);

    expect(frame).toContain('❯ add');
    expect(frame).not.toContain('❯ list');
  });

  it('moves the cursor with j', async () => {
    const { stdin, lastFrame } = renderRemotes();
    await settle(lastFrame, f => f.includes('❯ add'), 1000);

    const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ list'));
    expect(frame).toContain('❯ list');
  });

  it('does not render shell chrome (logo, key hints, version)', async () => {
    const { lastFrame } = renderRemotes();
    const frame = await settle(lastFrame, f => f.includes('add'), 1000);

    expect(frame).not.toContain('███╗');
    expect(frame).not.toContain('quit');
    expect(frame).not.toContain('v0.0.0');
  });
});
