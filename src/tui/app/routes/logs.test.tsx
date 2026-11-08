// routes/logs.test.tsx — The /logs shim's user-visible behavior (tui-live-logs
// T2): the ?container= query and the runtime store's active remote/password
// reach the page as props (keyed by container for a remount per target), no
// active remote navigates home, and a remote without a container navigates to
// the hub. The page barrel is mocked (the page has its own suite); the
// runtime store is the REAL zustand store seeded with setState (9.20
// pattern), inside a MemoryRouter so the redirects are observable as rendered
// markers.
import { createElement } from 'react';

import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LogsRoute from './logs.js';
import { initialAppRuntimeState, useAppRuntimeStore } from '../providers/app-runtime-store.js';

const LogsPage = vi.hoisted(() =>
  vi.fn((_props: { remote: string; sessionPassword?: string; container: string }) => null)
);

vi.mock('../../pages/logs/index.js', () => ({
  LogsPage: LogsPage,
}));

async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  let waited = 0;

  while (!predicate() && waited < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 10));
    waited += 10;
  }

  if (!predicate()) throw new Error('until: condition not met within timeout');
}

function renderRoute(initialEntry: string): { lastFrame: () => string; unmount: () => void } {
  const instance = render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/logs', element: createElement(LogsRoute) }),
        createElement(Route, { path: '/', element: createElement(Text, null, 'home-marker') }),
        createElement(Route, { path: '/remote-home', element: createElement(Text, null, 'remote-home-marker') })
      )
    )
  );

  return { lastFrame: () => instance.lastFrame()!, unmount: instance.unmount };
}

describe('LogsRoute shim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppRuntimeStore.setState({ ...initialAppRuntimeState });
  });

  it('injects remote, session password and the ?container= query into the page', async () => {
    useAppRuntimeStore.setState({ activeRemote: 'nas', activeRemotePassword: 'secret' });

    const { unmount } = renderRoute('/logs?container=web-1');

    await until(() => LogsPage.mock.calls.length > 0);
    expect(LogsPage).toHaveBeenCalledWith(
      expect.objectContaining({ remote: 'nas', sessionPassword: 'secret', container: 'web-1' }),
      undefined
    );
    // Unmount before the store resets: a leaked instance would keep
    // rendering against the next test's store state (FU9).
    unmount();
  });

  it('navigates home when no remote is active', async () => {
    useAppRuntimeStore.setState({ ...initialAppRuntimeState });

    const { lastFrame, unmount } = renderRoute('/logs?container=web-1');

    await until(() => lastFrame().includes('home-marker'));
    expect(lastFrame()).toContain('home-marker');
    unmount();
  });

  it.each(['/logs', '/logs?container='])(
    'navigates to the hub when the container query is missing or empty (%s)',
    async initialEntry => {
      useAppRuntimeStore.setState({ activeRemote: 'nas', activeRemotePassword: 'secret' });

      const { lastFrame, unmount } = renderRoute(initialEntry);

      await until(() => lastFrame().includes('remote-home-marker'));
      expect(lastFrame()).toContain('remote-home-marker');
      unmount();
    }
  );
});
