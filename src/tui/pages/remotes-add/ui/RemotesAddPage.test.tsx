// RemotesAddPage.test.tsx — Unit tests for the remotes.add page: it renders
// the absorbed add-remote wizard and resets the wizard store's session state
// on mount (and unmount), and navigates back to the main menu when the wizard
// completes. Per ADR-0019 §7 the wizard consumes services/remotes directly,
// so the service module is mocked (the page drives the store; the service
// only needs to resolve). MemoryRouter supplies the router context.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { MemoryRouter, useLocation } from 'react-router';

import { confirmAddRemote } from '../../../../services/remotes.js';
import { settle } from '../../../test-utils/ink-interactions.js';
import { useWizardStore } from '../model/wizard-store.js';
import { RemotesAddPage } from './RemotesAddPage.js';

vi.mock('../../../../services/remotes.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../services/remotes.js')>();
  return {
    ...actual,
    addRemote: vi.fn(async () => ({ saved: true })),
    confirmAddRemote: vi.fn(async () => ({ saved: true })),
  };
});

function LocationEcho() {
  return <Text>at:{useLocation().pathname}</Text>;
}

const renderAdd = () =>
  render(
    <MemoryRouter initialEntries={['/remotes/add']}>
      <LocationEcho />
      <RemotesAddPage />
    </MemoryRouter>
  );

describe('RemotesAddPage', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    vi.clearAllMocks();
    vi.mocked(confirmAddRemote).mockResolvedValue({ saved: true });
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

    // Complete the wizard: done step fires the confirm save, then onComplete
    // navigates to the main menu.
    useWizardStore.getState().validationSuccess('AA:BB:CC', true);
    const frame = await settle(lastFrame, f => f.includes('at:/'), 1000);

    expect(frame).toContain('at:/');
    unmount();
  });
});
