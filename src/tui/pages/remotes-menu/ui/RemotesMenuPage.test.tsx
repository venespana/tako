// RemotesMenuPage.test.tsx — Unit tests for the remotes menu page. The page
// has two modes: without an active remote it renders the SELECTION screen
// (model/remotes-selection fetching through an injected repository port);
// with one it renders the remotes submenu. A harness component holds the
// session's active-remote state so tests can drive the real transition
// (select with Enter → submenu). Logo and footer are app-shell chrome.
// MemoryRouter supplies the router context.
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { MemoryRouter, useLocation } from 'react-router';

import type { RemoteRepository } from '../../../../domains/remotes/application/RemoteRepository.js';
import type { RemoteSummary } from '../../../../domains/remotes/domain/types.js';
import { pressAndSettle, settle } from '../../../test-utils/ink-interactions.js';
import { RemotesMenuPage } from './RemotesMenuPage.js';

function fakeRepository(summaries: RemoteSummary[]): RemoteRepository {
  return {
    existsByName: vi.fn(async () => false),
    existsByEndpoint: vi.fn(async () => false),
    save: vi.fn(async () => {}),
    list: vi.fn(async () => summaries),
  };
}

/** Holds the session's active-remote state, mirroring App's ownership. */
function Harness({ repository, initialActive }: { repository: RemoteRepository; initialActive?: string }) {
  const [activeRemote, setActiveRemote] = useState<string | undefined>(initialActive);
  return <RemotesMenuPage repository={repository} activeRemote={activeRemote} onSelectRemote={setActiveRemote} />;
}

function LocationEcho() {
  return <Text>at:{useLocation().pathname}</Text>;
}

const REMOTES: RemoteSummary[] = [
  { name: 'nas', endpoint: 'ops@10.0.0.5:22' },
  { name: 'web', endpoint: 'admin@10.0.0.10:2222' },
];

const renderRemotes = (repository: RemoteRepository, initialActive?: string) =>
  render(
    <MemoryRouter initialEntries={['/remotes']}>
      <Harness repository={repository} initialActive={initialActive} />
    </MemoryRouter>
  );

describe('RemotesMenuPage (selection screen)', () => {
  it('lists the configured remotes with name and endpoint', async () => {
    const { lastFrame } = renderRemotes(fakeRepository(REMOTES));
    const frame = await settle(lastFrame, f => f.includes('Select a remote'), 1000);

    expect(frame).toContain('Select a remote');
    expect(frame).toContain('nas (ops@10.0.0.5:22)');
    expect(frame).toContain('web (admin@10.0.0.10:2222)');
  });

  it('starts the cursor on the first remote', async () => {
    const { lastFrame } = renderRemotes(fakeRepository(REMOTES));
    const frame = await settle(lastFrame, f => f.includes('Select a remote'), 1000);

    expect(frame).toContain('❯ nas');
    expect(frame).not.toContain('❯ web');
  });

  it('moves the cursor with j', async () => {
    const { stdin, lastFrame } = renderRemotes(fakeRepository(REMOTES));
    await settle(lastFrame, f => f.includes('❯ nas'), 1000);

    const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ web'));
    expect(frame).toContain('❯ web');
  });

  it('Enter selects the remote and transitions to the submenu', async () => {
    const { stdin, lastFrame } = renderRemotes(fakeRepository(REMOTES));
    await settle(lastFrame, f => f.includes('❯ nas'), 1000);

    // Enter over 'nas': selection screen → remotes submenu
    const frame = await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('❯ add'));

    expect(frame).toContain('❯ add');
    expect(frame).toContain('list');
    expect(frame).toContain('rm');
    expect(frame).toContain('use');
    expect(frame).toContain('test');
    expect(frame).not.toContain('Select a remote');
  });

  it('redirects to /remotes/add when no remotes are configured', async () => {
    const { lastFrame } = render(
      <MemoryRouter initialEntries={['/remotes']}>
        <LocationEcho />
        <Harness repository={fakeRepository([])} />
      </MemoryRouter>
    );

    const frame = await settle(lastFrame, f => f.includes('at:/remotes/add'), 1000);
    expect(frame).toContain('at:/remotes/add');
  });

  it('shows an error state when the configured list cannot be read', async () => {
    const repository: RemoteRepository = {
      existsByName: vi.fn(async () => false),
      existsByEndpoint: vi.fn(async () => false),
      save: vi.fn(async () => {}),
      list: vi.fn(async () => {
        throw new Error('conf unreadable');
      }),
    };

    const { lastFrame } = renderRemotes(repository);
    const frame = await settle(lastFrame, f => f.includes('Could not read'), 1000);

    expect(frame).toContain('Could not read configured remotes.');
    expect(frame).not.toContain('Select a remote');
  });
});

describe('RemotesMenuPage (submenu with an active remote)', () => {
  it('renders the submenu list (all five subcommands)', async () => {
    const { lastFrame } = renderRemotes(fakeRepository(REMOTES), 'nas');
    const frame = await settle(lastFrame, f => f.includes('add'), 1000);

    expect(frame).toContain('remotes');
    expect(frame).toContain('add');
    expect(frame).toContain('list');
    expect(frame).toContain('rm');
    expect(frame).toContain('use');
    expect(frame).toContain('test');
    // Selection screen never shows when a remote is already active
    expect(frame).not.toContain('Select a remote');
  });

  it('starts the cursor on the first subcommand (add)', async () => {
    const { lastFrame } = renderRemotes(fakeRepository(REMOTES), 'nas');
    const frame = await settle(lastFrame, f => f.includes('add'), 1000);

    expect(frame).toContain('❯ add');
    expect(frame).not.toContain('❯ list');
  });

  it('moves the cursor with j', async () => {
    const { stdin, lastFrame } = renderRemotes(fakeRepository(REMOTES), 'nas');
    await settle(lastFrame, f => f.includes('❯ add'), 1000);

    const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ list'));
    expect(frame).toContain('❯ list');
  });

  it('does not render shell chrome (logo, key hints, version)', async () => {
    const { lastFrame } = renderRemotes(fakeRepository(REMOTES));
    const frame = await settle(lastFrame, f => f.includes('Select a remote'), 1000);

    expect(frame).not.toContain('███╗');
    expect(frame).not.toContain('quit');
    expect(frame).not.toContain('v0.0.0');
  });
});
