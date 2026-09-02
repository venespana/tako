// HomePage.test.tsx — Unit tests for the home menu page. HomePage owns its
// list (registry groups + selectable + useMenuList); logo, key hints, and
// version are app-shell chrome and NOT part of this page. MemoryRouter
// supplies the router context useNavigate/useLocation need.
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { MemoryRouter } from 'react-router';

import { pressAndSettle, settle } from '../test-utils/ink-interactions.js';
import { HomePage } from './HomePage.js';

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
