// RemotesMenuPage.test.tsx — Unit tests for the remotes submenu page. The
// page owns its submenu list (model/remotes-menu data +
// useMenuList/useMenuNavigation); logo and footer are app-shell chrome.
// MemoryRouter supplies the router context.
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { MemoryRouter } from 'react-router';

import { pressAndSettle, settle } from '../../../test-utils/ink-interactions.js';
import { RemotesMenuPage } from './RemotesMenuPage.js';

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
