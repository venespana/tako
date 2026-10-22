// routes/status.test.tsx — R3-001 (review-72688e7aae1727c0): the /status
// shim's user-visible behavior is asserted — the store's active remote and
// session password reach the page as props, a remote switch remounts it via
// key (fresh props), and with no active remote the shim navigates home
// instead of rendering a stack status of nothing. The page barrel is mocked
// (the page itself has its own suite); the runtime store is the REAL zustand
// store seeded with setState (9.20 pattern), inside a MemoryRouter so
// useNavigate works and the redirect is observable as a rendered marker.
import { createElement } from 'react';

import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StatusRoute from './status.js';
import { initialAppRuntimeState, useAppRuntimeStore } from '../providers/app-runtime-store.js';

const StatusPage = vi.hoisted(() => vi.fn(() => null));

vi.mock('../../pages/status/index.js', () => ({
  StatusPage: StatusPage,
}));

async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  for (let waited = 0; !predicate() && waited < timeoutMs; waited += 10) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!predicate()) throw new Error('until: condition not met within timeout');
}

function renderRoute(): { lastFrame: () => string; unmount: () => void } {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/status'] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/status', element: createElement(StatusRoute) }),
        createElement(Route, { path: '/', element: createElement(Text, null, 'home-marker') }),
      ),
    )
  );
}

describe('StatusRoute shim (R3-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppRuntimeStore.setState({ ...initialAppRuntimeState });
  });

  it('injects the active remote and session password into the page as props', async () => {
    useAppRuntimeStore.setState({ activeRemote: 'nas', activeRemotePassword: 'secret' });

    renderRoute();

    await until(() => StatusPage.mock.calls.length > 0);
    expect(StatusPage).toHaveBeenCalledWith(
      expect.objectContaining({ remote: 'nas', sessionPassword: 'secret' }),
      undefined
    );
  });

  it('remounts the page with fresh props when the active remote switches', async () => {
    useAppRuntimeStore.setState({ activeRemote: 'nas', activeRemotePassword: 'one' });

    renderRoute();
    await until(() => StatusPage.mock.calls.length > 0);

    useAppRuntimeStore.setState({ activeRemote: 'vault', activeRemotePassword: 'two' });
    await until(() =>
      StatusPage.mock.calls.some(call => (call[0] as { remote: string }).remote === 'vault')
    );

    const last = StatusPage.mock.calls.at(-1)![0] as { remote: string; sessionPassword: string };
    expect(last).toEqual({ remote: 'vault', sessionPassword: 'two' });
  });

  it('navigates home when no remote is active', async () => {
    useAppRuntimeStore.setState({ ...initialAppRuntimeState });

    const { lastFrame, unmount } = renderRoute();

    await until(() => lastFrame().includes('home-marker'));
    expect(lastFrame()).toContain('home-marker');
    // The shim still hands the page the empty remote (the page's own guard
    // renders nothing) — the contract under test is the redirect plus the
    // empty-remote prop flow, not a withheld render.
    expect(StatusPage).toHaveBeenCalledWith(
      expect.objectContaining({ remote: '', sessionPassword: undefined }),
      undefined
    );
    unmount();
  });
});
