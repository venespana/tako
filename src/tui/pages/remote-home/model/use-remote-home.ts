// use-remote-home.ts — The remote-home hub's data hook: fetches the active
// remote's container list through services/docker (getContainers, ADR-0019
// §7 — pages may import services) as a small state machine: loading →
// ok{view} | empty | error. `unknown-remote` and `refusal` both land in
// error with their reason (strict-refusal convention: corrupt output never
// renders as partial data). The ok outcome is grouped into the page's view
// model (remote-home.ts) here, so the UI renders from one ready shape.
// Refresh re-runs the fetch through loading; a cancel flag ignores late
// resolutions after unmount/disable (the use-status pattern).
import { useCallback, useEffect, useState } from 'react';

import { toRemoteHomeView } from './remote-home.js';
import type { RemoteHomeView } from './remote-home.js';
import { getContainers } from '../../../../services/docker.js';

/** The page's full view state; `loading` until the service settles. */
export type RemoteHomeState =
  | { phase: 'loading' }
  | { phase: 'ok'; view: RemoteHomeView }
  | { phase: 'empty' }
  | { phase: 'error'; reason: string };

export interface UseRemoteHomeOptions {
  /** Active remote name; empty means no remote (the shim redirects). */
  remote: string;
  /** Connect-time password for the active remote (session-only). */
  sessionPassword: string | undefined;
  /** false skips fetching entirely (the page renders its guard instead). */
  enabled: boolean;
}

export interface RemoteHomeModel {
  state: RemoteHomeState;
  /** Re-run the fetch: back through loading, then to the new outcome. */
  refresh: () => void;
}

export function useRemoteHome({ remote, sessionPassword, enabled }: UseRemoteHomeOptions): RemoteHomeModel {
  const [state, setState] = useState<RemoteHomeState>({ phase: 'loading' });

  // Bump-to-refetch: refresh() flips the view back to loading (event-handler
  // setState — never synchronous inside the effect) and bumps a tick; the
  // effect below owns every fetch pass, so a superseded pass is always
  // cancelled by the effect cleanup before the next one starts.
  const [tick, setTick] = useState(0);

  // One fetch pass; returns a cancel flag so late resolutions after
  // deactivation/unmount (or a superseded refresh) are ignored. setState
  // runs only in the promise callbacks, never synchronously in the effect.
  const fetchContainers = useCallback(() => {
    let cancelled = false;

    getContainers({ remote, sessionPassword }).then(
      outcome => {
        if (cancelled) return;

        if (outcome.kind === 'ok') {
          setState(
            outcome.containers.length === 0
              ? { phase: 'empty' }
              : { phase: 'ok', view: toRemoteHomeView(outcome.containers) }
          );

          return;
        }

        setState({ phase: 'error', reason: outcome.reason });
      },
      error => {
        if (cancelled) return;

        // The service resolves expected outcomes as refusal objects; a
        // rejection is an unexpected transport failure — still an error
        // state, never a crash.
        setState({ phase: 'error', reason: error instanceof Error ? error.message : String(error) });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [remote, sessionPassword]);

  // Fetch once per activation (mount, re-enable, remote change, refresh).
  useEffect(() => {
    if (!enabled) return;

    return fetchContainers();
  }, [enabled, fetchContainers, tick]);

  const refresh = useCallback(() => {
    setState({ phase: 'loading' });
    setTick(previous => previous + 1);
  }, []);

  return { state, refresh };
}
