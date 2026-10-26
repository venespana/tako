// LogsPage.tsx — The live logs screen's shell (tui-live-logs T2/T4; keyed
// remount reconnect in T8 C1): owns the reconnect counter and renders one
// session per attempt. `key={attempt}` remounts LogsSession on `r` — a fresh
// mount is fresh state, so the fresh pass starts from an empty ring in the
// SAME commit the superseded pass dies. WHY a remount instead of an in-hook
// reset: an effect-body setState would paint one commit of the superseded
// pass's stale ring (and add a render), and the render-phase setState it
// replaced was flagged in review — a keyed remount resets structurally, with
// no guard code at all.
import { useState } from 'react';

import { LogsSession } from './LogsSession.js';

export interface LogsPageProps {
  /** Active remote name; empty means none (the shim redirects). */
  readonly remote: string;
  /** Connect-time password for the active remote (session-only). */
  readonly sessionPassword: string | undefined;
  /** Container name from the ?container= query (empty → the shim redirects). */
  readonly container: string;
}

export function LogsPage({ remote, sessionPassword, container }: LogsPageProps): React.ReactElement {
  // Bump-to-reconnect (the status page's bump-to-refetch): `r` in the
  // session bumps the attempt; the key change unmounts the superseded pass
  // (its cleanup stops its handle) and mounts a fresh one.
  const [attempt, setAttempt] = useState(0);

  // Guard: the shim redirects on an empty container; the impossible case
  // renders nothing (and mounts no session).
  if (container === '') return <></>;

  return (
    <LogsSession
      key={attempt}
      remote={remote}
      sessionPassword={sessionPassword}
      container={container}
      onRetry={() => setAttempt(previous => previous + 1)}
    />
  );
}
