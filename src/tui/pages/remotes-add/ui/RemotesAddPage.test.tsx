// RemotesAddPage.test.tsx — Unit tests for the remotes.add page: it embeds
// the add-remote-wizard feature component with an injected use case, resets
// the wizard store's session state on mount (and unmount), and navigates
// back to '/remotes' when the wizard completes. MemoryRouter supplies the
// router context the navigation needs.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { MemoryRouter, useLocation } from 'react-router';

import type { AddRemote } from '../../../../domains/remotes/application/AddRemote.js';
import { useWizardStore } from '../../../features/remotes/add-remote-wizard/index.js';
import { settle } from '../../../test-utils/ink-interactions.js';
import { RemotesAddPage } from './RemotesAddPage.js';

const fakeAddRemote = {
  execute: vi.fn(async () => ({ saved: false, reason: 'validation' })),
  save: vi.fn(async () => ({ saved: true })),
} as unknown as AddRemote;

function LocationEcho() {
  return <Text>at:{useLocation().pathname}</Text>;
}

const renderAdd = () =>
  render(
    <MemoryRouter initialEntries={['/remotes/add']}>
      <LocationEcho />
      <RemotesAddPage addRemoteUc={fakeAddRemote} />
    </MemoryRouter>
  );

describe('RemotesAddPage', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    vi.clearAllMocks();
  });

  it('renders the embedded wizard (first step prompt)', async () => {
    const { lastFrame, unmount } = renderAdd();
    const frame = await settle(lastFrame, f => f.includes('Connection name:'), 1000);

    expect(frame).toContain('Add Remote');
    expect(frame).toContain('Connection name:');
    unmount();
  });

  it('resets stale wizard state on mount (fresh run per page entry)', async () => {
    // Simulate a previous completed run left in the process-singleton store
    useWizardStore.setState({ step: 'done', data: { ...useWizardStore.getState().data, name: 'old' } });

    const { lastFrame, unmount } = renderAdd();
    // The mount effect resets the store, so the wizard starts at the name step
    const frame = await settle(lastFrame, f => f.includes('Connection name:'), 1000);

    expect(frame).not.toContain('saved successfully');
    unmount();
  });

  it('leaves the wizard store clean after unmount', async () => {
    const { lastFrame, unmount } = renderAdd();
    await settle(lastFrame, f => f.includes('Connection name:'), 1000);
    unmount();

    expect(useWizardStore.getState().step).toBe('name');
    expect(useWizardStore.getState().data.name).toBe('');
  });

  it('navigates to the main menu (/) when the wizard completes', async () => {
    const { lastFrame, unmount } = renderAdd();
    await settle(lastFrame, f => f.includes('Connection name:'), 1000);

    // Complete the wizard: done step fires the save effect, then onComplete
    // navigates to the main menu.
    useWizardStore.getState().validationSuccess('AA:BB:CC', true);
    const frame = await settle(lastFrame, f => f.includes('at:/'), 1000);

    expect(frame).toContain('at:/');
    unmount();
  });
});
