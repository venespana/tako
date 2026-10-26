// LogsSession.tsx — One live log-stream session (tui-live-logs T8 C1): the
// hook's phase machine rendered — the dashboard (viewport-bounded window
// with the title/meta/status block on top) for connecting/streaming/ended,
// the error view for the verbatim refusal/transport reason. Extracted from
// LogsPage (one component per file) so the page can key it per reconnect: a
// remount is fresh state, so a fresh pass never inherits the superseded
// pass's ring — the reset is structural, with no guard code. The footer
// hints and the `r` binding live here: only a dead or finished stream
// advertises reconnect, and `r` just calls the parent's onRetry — the
// REMOUNT (not local state) is the reset.
import { Box } from 'ink';

import { LogsDashboard } from './LogsDashboard.js';
import { LogsError } from './LogsError.js';
import type { KeyHint } from '../../../shared/lib/page-hints-store.js';
import { usePageHints } from '../../../shared/lib/page-hints-store.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';
import { useLiveLogs } from '../model/use-live-logs.js';

// Identity-stable hint constants (usePageHints effect dep) — a fresh literal
// per render would re-publish on every render (9.10 lesson).
const RETRY_HINTS: readonly KeyHint[] = [{ key: 'r', label: 'reconnect' }];
const NO_HINTS: readonly KeyHint[] = [];

export interface LogsSessionProps {
  readonly remote: string;
  readonly sessionPassword: string | undefined;
  readonly container: string;
  /** Called by the `r` binding (error/ended only); the parent remounts this
   * session with a fresh key, which stops this pass's handle in cleanup. */
  readonly onRetry: () => void;
}

export function LogsSession({ remote, sessionPassword, container, onRetry }: LogsSessionProps): React.ReactElement {
  const { state, lines } = useLiveLogs({
    remote,
    sessionPassword,
    container,
    enabled: container !== '',
  });

  // The session's SINGLE hints writer: a dead/finished stream advertises
  // reconnect; connecting/streaming publish nothing (back/quit only).
  const hints = state.phase === 'error' || state.phase === 'ended' ? RETRY_HINTS : NO_HINTS;

  usePageHints(hints);

  // r reconnects — offered ONLY when the stream is not live: while streaming
  // or connecting the binding is inert, so there can never be two streams.
  useKeyBindings({ chars: { r: onRetry } }, { isActive: state.phase === 'error' || state.phase === 'ended' });

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      <Box height={2} />

      {state.phase === 'error' ? (
        <LogsError reason={state.reason} />
      ) : (
        <LogsDashboard container={container} remote={remote} phase={state.phase} lines={lines} />
      )}
    </Box>
  );
}
