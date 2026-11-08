// use-status.test.ts — Unit tests for the status page's data hook: the
// loading → ok | empty | error state machine over services/docker
// (getStackStatus), the unknown-remote/refusal → error mapping (strict
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

import { useStatusPage } from './use-status.js';
import type { GetStackStatusOutcome, StackStatusEntry } from '../../../../services/docker.js';
import { getStackStatus } from '../../../../services/docker.js';
import { settle } from '../../../test-utils/ink-interactions.js';

vi.mock('../../../../services/docker.js', async importOriginal => {
  // Spread the REAL module so the re-exported contract types keep working;
  // only the transport-bearing function is replaced.
  const actual = await importOriginal<typeof import('../../../../services/docker.js')>();
  return { ...actual, getStackStatus: vi.fn() };
});

const ENTRIES: StackStatusEntry[] = [
  { name: 'media', status: 'running(3)', configFiles: '/opt/media/compose.yaml' },
  { name: 'proxy', status: 'running(2)', configFiles: '/opt/proxy/compose.yaml' },
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
  const { state, refresh } = useStatusPage({ remote, sessionPassword: undefined, enabled });

  // Expose the refresh callback via an effect, not a render-phase ref write:
  // the value lands after commit, which is fine — tests only call it from
  // settled frames.
  useEffect(() => {
    if (apiRef) apiRef.current = { refresh };
  }, [apiRef, refresh]);

  const detail =
    state.phase === 'ok'
      ? ` entries:${state.entries.map(entry => entry.name).join(',')} at:${state.fetchedAt instanceof Date}`
      : state.phase === 'empty'
        ? ` at:${state.fetchedAt instanceof Date}`
        : state.phase === 'error'
          ? ` reason:${state.reason}`
          : '';

  return createElement(Text, null, `phase:${state.phase}${detail}`);
}

/** Delayed status service (keeps the loading window real). */
function stubStatus(outcome: { result?: GetStackStatusOutcome; error?: Error }): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(
    () =>
      new Promise<GetStackStatusOutcome>((resolve, reject) => {
        setTimeout(() => {
          if (outcome.error) reject(outcome.error);
          else resolve(outcome.result ?? { kind: 'ok', entries: [] });
        }, 20);
      })
  );

  vi.mocked(getStackStatus).mockImplementation(fetch);

  return fetch;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 30));

describe('useStatusPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubStatus({ result: { kind: 'ok', entries: [] } });
  });

  it('fetches through the service: loading until resolve, then ok with entries', async () => {
    const fetch = stubStatus({ result: { kind: 'ok', entries: ENTRIES } });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const loading = await settle(lastFrame, frame => frame.includes('phase:loading'), 200);
    expect(loading).toContain('phase:loading');

    const ok = await settle(lastFrame, frame => frame.includes('phase:ok'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith({ remote: 'nas', sessionPassword: undefined });
    expect(ok).toContain('entries:media,proxy');
    expect(ok).toContain('at:true');
    unmount();
  });

  it('maps a zero-entry ok outcome to the empty phase (with fetchedAt)', async () => {
    stubStatus({ result: { kind: 'ok', entries: [] } });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const empty = await settle(lastFrame, frame => frame.includes('phase:empty'));
    expect(empty).toContain('phase:empty');
    expect(empty).toContain('at:true');
    unmount();
  });

  it('maps refusal to error with the reason verbatim', async () => {
    stubStatus({ result: { kind: 'refusal', reason: 'compose ls output is not a JSON array' } });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const error = await settle(lastFrame, frame => frame.includes('phase:error'));
    expect(error).toContain('phase:error');
    expect(error).toContain('reason:compose ls output is not a JSON array');
    unmount();
  });

  it('maps unknown-remote to error with the reason', async () => {
    stubStatus({ result: { kind: 'unknown-remote', reason: 'no remote named ghost' } });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const error = await settle(lastFrame, frame => frame.includes('phase:error'));
    expect(error).toContain('phase:error');
    expect(error).toContain('reason:no remote named ghost');
    unmount();
  });

  it('maps an unexpected service rejection to error', async () => {
    stubStatus({ error: new Error('ssh channel open failed') });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const error = await settle(lastFrame, frame => frame.includes('phase:error'));
    expect(error).toContain('reason:ssh channel open failed');
    unmount();
  });

  it('stays inert when disabled (no fetch)', async () => {
    const fetch = stubStatus({ result: { kind: 'ok', entries: ENTRIES } });
    const { lastFrame, unmount } = render(createElement(Probe, { enabled: false }));

    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('phase:loading');
    unmount();
  });

  it('refresh re-runs the fetch through loading', async () => {
    stubStatus({ result: { kind: 'ok', entries: ENTRIES } });
    const apiRef: { current: ProbeApi | null } = { current: null };
    const { lastFrame, unmount } = render(createElement(Probe, { apiRef }));
    await settle(lastFrame, frame => frame.includes('phase:ok'));
    expect(vi.mocked(getStackStatus)).toHaveBeenCalledTimes(1);

    // Second fetch: deferred so the loading window is observable.
    let resolveSecond!: (outcome: GetStackStatusOutcome) => void;
    vi.mocked(getStackStatus).mockImplementation(
      () =>
        new Promise<GetStackStatusOutcome>(resolve => {
          resolveSecond = resolve;
        })
    );

    apiRef.current!.refresh();

    // The effect dispatches the second fetch only after the loading commit —
    // wait for the call before resolving, or `resolveSecond` may still be
    // unassigned (observed as a load-order flake under parallel vitest).
    await vi.waitFor(() => expect(vi.mocked(getStackStatus)).toHaveBeenCalledTimes(2));

    const loading = await settle(lastFrame, frame => frame.includes('phase:loading'));
    expect(loading).toContain('phase:loading');

    resolveSecond({ kind: 'ok', entries: [] });
    const empty = await settle(lastFrame, frame => frame.includes('phase:empty'));
    expect(empty).toContain('phase:empty');
    expect(vi.mocked(getStackStatus)).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('ignores a late resolution after disable', async () => {
    let resolveFetch!: (outcome: GetStackStatusOutcome) => void;
    vi.mocked(getStackStatus).mockImplementation(
      () =>
        new Promise<GetStackStatusOutcome>(resolve => {
          resolveFetch = resolve;
        })
    );
    const { lastFrame, rerender, unmount } = render(createElement(Probe, { enabled: true }));
    await settle(lastFrame, frame => frame.includes('phase:loading'), 200);

    rerender(createElement(Probe, { enabled: false }));
    resolveFetch({ kind: 'ok', entries: ENTRIES });
    await flush();

    // The late ok resolution landed after deactivation — the state must not
    // have moved off loading.
    expect(lastFrame()).toContain('phase:loading');
    unmount();
  });

  it('ignores a late resolution after unmount', async () => {
    let resolveFetch!: (outcome: GetStackStatusOutcome) => void;
    vi.mocked(getStackStatus).mockImplementation(
      () =>
        new Promise<GetStackStatusOutcome>(resolve => {
          resolveFetch = resolve;
        })
    );
    const { unmount } = render(createElement(Probe, null));
    unmount();

    expect(() => resolveFetch({ kind: 'ok', entries: ENTRIES })).not.toThrow();
    await flush();
    // No unhandled rejection and no post-unmount state write — vitest fails
    // this test on either.
    expect(vi.mocked(getStackStatus)).toHaveBeenCalledTimes(1);
  });
});
