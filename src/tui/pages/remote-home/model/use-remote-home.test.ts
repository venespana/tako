// use-remote-home.test.ts — Unit tests for the remote-home hub's data hook:
// the loading → ok{view} | empty | error state machine over services/docker
// (getContainers), the unknown-remote/refusal → error mapping (strict
// refusal: the reason lands verbatim), the refresh flow (back through
// loading), and the cancellation flag (late resolutions after disable or
// unmount are ignored). The service is mocked per the remotes-selection
// style; a probe element renders the hook's state as text (createElement,
// keeping this file .ts) and the mocked service resolves on a timer so the
// loading window is real.
import { useEffect, createElement } from 'react';

import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRemoteHome } from './use-remote-home.js';
import type { ContainerSnapshot, GetContainersOutcome } from '../../../../services/docker.js';
import { getContainers } from '../../../../services/docker.js';
import { settle } from '../../../test-utils/ink-interactions.js';

vi.mock('../../../../services/docker.js', async importOriginal => {
  // Spread the REAL module so the re-exported contract types keep working;
  // only the transport-bearing function is replaced.
  const actual = await importOriginal<typeof import('../../../../services/docker.js')>();
  return { ...actual, getContainers: vi.fn() };
});

const CONTAINERS: ContainerSnapshot[] = [
  { id: '1', name: 'grafana', state: 'running', composeProject: 'monitoring' },
  { id: '2', name: 'prometheus', state: 'running', composeProject: 'monitoring' },
  { id: '3', name: 'portainer', state: 'running', composeProject: null },
];

interface ProbeApi {
  refresh: () => void;
}

function Probe({
  remote = 'nas',
  enabled = true,
  apiRef,
}: {
  remote?: string;
  enabled?: boolean;
  apiRef?: { current: ProbeApi | null };
}) {
  const { state, refresh } = useRemoteHome({ remote, sessionPassword: undefined, enabled });

  // Expose the refresh callback via an effect, not a render-phase ref write:
  // the value lands after commit, which is fine — tests only call it from
  // settled frames.
  useEffect(() => {
    if (apiRef) apiRef.current = { refresh };
  }, [apiRef, refresh]);

  const detail =
    state.phase === 'ok'
      ? ` groups:${state.view.groups.map(group => group.name).join(',')} total:${state.view.totalContainers}`
      : state.phase === 'error'
        ? ` reason:${state.reason}`
        : '';

  return createElement(Text, null, `phase:${state.phase}${detail}`);
}

/** Delayed containers service (keeps the loading window real). */
function stubContainers(outcome: { result?: GetContainersOutcome; error?: Error }): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(
    () =>
      new Promise<GetContainersOutcome>((resolve, reject) => {
        setTimeout(() => {
          if (outcome.error) reject(outcome.error);
          else resolve(outcome.result ?? { kind: 'ok', containers: [] });
        }, 20);
      })
  );

  vi.mocked(getContainers).mockImplementation(fetch);

  return fetch;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 30));

describe('useRemoteHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubContainers({ result: { kind: 'ok', containers: [] } });
  });

  it('fetches through the service: loading until resolve, then ok with the grouped view', async () => {
    const fetch = stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const loading = await settle(lastFrame, frame => frame.includes('phase:loading'), 200);
    expect(loading).toContain('phase:loading');

    const ok = await settle(lastFrame, frame => frame.includes('phase:ok'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith({ remote: 'nas', sessionPassword: undefined });
    // Others last, compose groups alphabetical.
    expect(ok).toContain('groups:monitoring,Others');
    expect(ok).toContain('total:3');
    unmount();
  });

  it('maps a zero-container ok outcome to the empty phase', async () => {
    stubContainers({ result: { kind: 'ok', containers: [] } });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const empty = await settle(lastFrame, frame => frame.includes('phase:empty'));
    expect(empty).toContain('phase:empty');
    unmount();
  });

  it('maps refusal to error with the reason verbatim', async () => {
    stubContainers({ result: { kind: 'refusal', reason: 'docker ps line 1 is not valid JSON' } });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const error = await settle(lastFrame, frame => frame.includes('phase:error'));
    expect(error).toContain('phase:error');
    expect(error).toContain('reason:docker ps line 1 is not valid JSON');
    unmount();
  });

  it('maps unknown-remote to error with the reason', async () => {
    stubContainers({ result: { kind: 'unknown-remote', reason: 'no remote named ghost' } });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const error = await settle(lastFrame, frame => frame.includes('phase:error'));
    expect(error).toContain('phase:error');
    expect(error).toContain('reason:no remote named ghost');
    unmount();
  });

  it('maps an unexpected service rejection to error', async () => {
    stubContainers({ error: new Error('ssh channel open failed') });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const error = await settle(lastFrame, frame => frame.includes('phase:error'));
    expect(error).toContain('reason:ssh channel open failed');
    unmount();
  });

  it('stays inert when disabled (no fetch)', async () => {
    const fetch = stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
    const { lastFrame, unmount } = render(createElement(Probe, { enabled: false }));

    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('phase:loading');
    unmount();
  });

  it('refresh re-runs the fetch through loading', async () => {
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
    const apiRef: { current: ProbeApi | null } = { current: null };
    const { lastFrame, unmount } = render(createElement(Probe, { apiRef }));
    await settle(lastFrame, frame => frame.includes('phase:ok'));
    expect(vi.mocked(getContainers)).toHaveBeenCalledTimes(1);

    // Second fetch: deferred so the loading window is observable.
    let resolveSecond!: (outcome: GetContainersOutcome) => void;
    vi.mocked(getContainers).mockImplementation(
      () =>
        new Promise<GetContainersOutcome>(resolve => {
          resolveSecond = resolve;
        })
    );

    apiRef.current!.refresh();

    const loading = await settle(lastFrame, frame => frame.includes('phase:loading'));
    expect(loading).toContain('phase:loading');

    // refresh() paints loading synchronously; the effect's fetch pass lands
    // a commit later — wait for the second call before resolving it.
    await vi.waitFor(() => {
      expect(vi.mocked(getContainers)).toHaveBeenCalledTimes(2);
    });

    resolveSecond({ kind: 'ok', containers: [] });
    const empty = await settle(lastFrame, frame => frame.includes('phase:empty'));
    expect(empty).toContain('phase:empty');
    expect(vi.mocked(getContainers)).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('ignores a late resolution after disable', async () => {
    let resolveFetch!: (outcome: GetContainersOutcome) => void;
    vi.mocked(getContainers).mockImplementation(
      () =>
        new Promise<GetContainersOutcome>(resolve => {
          resolveFetch = resolve;
        })
    );
    const { lastFrame, rerender, unmount } = render(createElement(Probe, { enabled: true }));
    await settle(lastFrame, frame => frame.includes('phase:loading'), 200);

    rerender(createElement(Probe, { enabled: false }));
    resolveFetch({ kind: 'ok', containers: CONTAINERS });
    await flush();

    // The late ok resolution landed after deactivation — the state must not
    // have moved off loading.
    expect(lastFrame()).toContain('phase:loading');
    unmount();
  });

  it('ignores a late resolution after unmount', async () => {
    let resolveFetch!: (outcome: GetContainersOutcome) => void;
    vi.mocked(getContainers).mockImplementation(
      () =>
        new Promise<GetContainersOutcome>(resolve => {
          resolveFetch = resolve;
        })
    );
    const { unmount } = render(createElement(Probe, null));
    unmount();

    expect(() => resolveFetch({ kind: 'ok', containers: CONTAINERS })).not.toThrow();
    await flush();
    // No unhandled rejection and no post-unmount state write — vitest fails
    // this test on either.
    expect(vi.mocked(getContainers)).toHaveBeenCalledTimes(1);
  });
});
