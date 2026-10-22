// StatusPage.tsx — The status screen: composes useStatusPage (the fetch
// state machine over services/docker) with the four designed state views,
// and owns the keys and the footer hints. Header/footer are app-shell
// chrome — this page renders the body only (2-line spacer then heading,
// like every page). The route shim injects the active remote + session
// password; without a remote the shim redirects and this page renders
// nothing.
import { useMemo } from 'react';

import { Box } from 'ink';

import { StatusDashboard } from './StatusDashboard.js';
import { StatusEmpty } from './StatusEmpty.js';
import { StatusError } from './StatusError.js';
import { StatusLoading } from './StatusLoading.js';
import type { ActionItem } from '../../../features/menu/index.js';
import { useMenuList } from '../../../features/menu/index.js';
import type { KeyHint } from '../../../shared/lib/page-hints-store.js';
import { usePageHints } from '../../../shared/lib/page-hints-store.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';
import { useStatusPage } from '../model/use-status.js';

// Identity-stable hint constants per variant (usePageHints effect dep) — a
// fresh literal per render would re-publish on every render (9.10 lesson).
const REFRESH_HINTS: readonly KeyHint[] = [{ key: 'r', label: 'refresh' }];
const RETRY_HINTS: readonly KeyHint[] = [{ key: 'r', label: 'retry' }];
const NO_HINTS: readonly KeyHint[] = [];

export interface StatusPageProps {
  /** Active remote name; empty means none (the shim redirects home). */
  remote: string;
  /** Connect-time password for the active remote (session-only). */
  sessionPassword: string | undefined;
}

export function StatusPage({ remote, sessionPassword }: StatusPageProps): React.ReactElement {
  const { state, refresh } = useStatusPage({ remote, sessionPassword, enabled: remote !== '' });

  // The page's SINGLE hints writer: loading publishes nothing, dashboard and
  // empty advertise r refresh, error advertises r retry.
  const hints = state.phase === 'loading' ? NO_HINTS : state.phase === 'error' ? RETRY_HINTS : REFRESH_HINTS;

  usePageHints(hints);

  // Table rows as minimal menu items so the shared menu list owns ↑↓; Enter/l
  // select is intentionally a no-op — the detail column tracks the cursor.
  const rows = useMemo<ActionItem[]>(
    () =>
      state.phase === 'ok'
        ? state.entries.map(entry => ({ id: entry.name, label: entry.name, command: entry.name, kind: 'action' }))
        : [],
    [state]
  );

  const { cursor } = useMenuList({ selectable: rows, onSelect: () => undefined }, state.phase === 'ok');
  const focusedName = rows[cursor]?.id;

  // r refreshes (dashboard/empty) or retries (error); inert while loading.
  useKeyBindings({ chars: { r: refresh } }, { isActive: state.phase !== 'loading' });

  // Guard (after hooks, per hooks rules): the shim redirects on no remote.
  if (remote === '') {
    return <></>;
  }

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      <Box height={2} />

      {state.phase === 'loading' && <StatusLoading remote={remote} />}
      {state.phase === 'ok' && (
        <StatusDashboard entries={state.entries} fetchedAt={state.fetchedAt} focusedName={focusedName} />
      )}
      {state.phase === 'empty' && <StatusEmpty remote={remote} />}
      {state.phase === 'error' && <StatusError remote={remote} reason={state.reason} />}
    </Box>
  );
}
