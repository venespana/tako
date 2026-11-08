// HomePage.test.tsx — Unit tests for the home menu page. HomePage owns its
// list (model/home-menu data + useMenuList/useMenuNavigation); logo, key
// hints, and version are app-shell chrome and NOT part of this page.
// MemoryRouter supplies the router context the navigation hooks need.
import { render } from 'ink-testing-library';
import { MemoryRouter } from 'react-router';
import { describe, it, expect } from 'vitest';

import { HomePage } from './HomePage.js';
import { pressAndSettle, settle } from '../../../test-utils/ink-interactions.js';

const renderHome = (hasActiveRemote = false) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <HomePage hasActiveRemote={hasActiveRemote} />
    </MemoryRouter>
  );

describe('HomePage', () => {
  it('renders the registry groups and items', async () => {
    const { lastFrame } = renderHome();
    const frame = await settle(lastFrame, f => f.includes('Local'));

    expect(frame).toContain('Local');
    expect(frame).toContain('Remote');
    expect(frame).toContain('Config');
    expect(frame).toContain('doctor');
    expect(frame).toContain('Select');
    expect(frame).toContain('Add');
    expect(frame).toContain('Delete');
  });

  it('starts the cursor on the first selectable item (doctor)', async () => {
    const { lastFrame } = renderHome();
    const frame = await settle(lastFrame, f => f.includes('Local'));

    expect(frame).toContain('❯ doctor');
  });

  it('wraps movement within the selectable list (no active remote)', async () => {
    // hasActiveRemote=false: selectable = [doctor, Select, Add, Delete]
    // Two j presses from doctor → Select → Add → wraps back to doctor
    const { stdin, lastFrame } = renderHome(false);
    await settle(lastFrame, f => f.includes('❯ doctor'));

    const frame1 = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Select'));
    expect(frame1).toContain('❯ Select');

    const frame2 = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Add'));
    expect(frame2).toContain('❯ Add');

    const frame3 = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Delete'));
    expect(frame3).toContain('❯ Delete');

    const frame4 = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ doctor'));
    expect(frame4).toContain('❯ doctor');
  });

  it('shows all items when a remote is active', async () => {
    // All items are always enabled now — no more gated items
    const { stdin, lastFrame } = renderHome(true);
    await settle(lastFrame, f => f.includes('❯ doctor'));

    const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Select'));
    expect(frame).toContain('❯ Select');
  });

  it('does not render shell chrome (logo, key hints, version)', async () => {
    const { lastFrame } = renderHome();
    const frame = await settle(lastFrame, f => f.includes('Local'));

    expect(frame).not.toContain('███╗');
    expect(frame).not.toContain('quit');
    expect(frame).not.toContain('v0.0.0');
  });
});
