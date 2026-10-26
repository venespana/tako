// RemoteHomePage.tsx — The Home/Remote hub screen (pen frame
// "Screen - Home / Remote"): static tab strip (Services active), the state
// views over useRemoteHome (the active remote's REAL containers), and the
// cursor-owned composition — the cursor walks the containers of expanded
// groups PLUS collapsed group rows via the shared menu list (↑↓), space
// collapses a focused container's group / expands a focused collapsed
// group, `l` on a focused CONTAINER opens its live logs (tui-live-logs),
// and the detail panel tracks the cursor. Logo, active-remote header and
// footer are app-shell chrome; tab switching and the remaining container
// actions are later iterations.
import { useMemo, useState } from 'react';

import { Box, Text } from 'ink';

import { useNavigate } from 'react-router';

import { Divider } from './Divider.js';
import { RemoteHomeDashboard } from './RemoteHomeDashboard.js';
import { RemoteHomeEmpty } from './RemoteHomeEmpty.js';
import { RemoteHomeError } from './RemoteHomeError.js';
import { RemoteHomeLoading } from './RemoteHomeLoading.js';
import { useMenuList } from '../../../features/menu/index.js';
import type { ActionItem } from '../../../features/menu/index.js';
import type { KeyHint } from '../../../shared/lib/page-hints-store.js';
import { usePageHints } from '../../../shared/lib/page-hints-store.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';
import { selectableRows } from '../model/remote-home.js';
import type { InventoryRow } from '../model/remote-home.js';
import { useRemoteHome } from '../model/use-remote-home.js';

// Identity-stable hint constants (usePageHints effect dep) — a fresh literal
// per render would re-publish on every render (9.10 lesson). Container rows
// advertise logs; group rows (and every non-ok phase) advertise space only.
const CONTAINER_HINTS: readonly KeyHint[] = [
  { key: 'space', label: 'collapse/expand' },
  { key: 'l', label: 'logs' },
];
const GROUP_HINTS: readonly KeyHint[] = [{ key: 'space', label: 'collapse/expand' }];
const NO_HINTS: readonly KeyHint[] = [];

/** Collapsed-group menu items are prefixed so they can never collide with
 * a container id (docker ids contain no '/'); the prefix doubles as the
 * container-vs-group row marker for the select path. */
const GROUP_ID_PREFIX = 'group/';

export interface RemoteHomePageProps {
  /** Active remote name; empty means none (the shim redirects). */
  remote: string;
  /** Connect-time password for the active remote (session-only). */
  sessionPassword: string | undefined;
}

export function RemoteHomePage({ remote, sessionPassword }: RemoteHomePageProps): React.ReactElement {
  const { state } = useRemoteHome({ remote, sessionPassword, enabled: remote !== '' });

  // Collapse state lives HERE, not in the view model: everything starts
  // expanded and the updater form never reads stale state (no effect ever
  // writes it).
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());

  const toggleGroup = (groupId: string): void => {
    setCollapsedIds(previous => {
      const next = new Set(previous);

      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);

      return next;
    });
  };

  // The page's single derivation of the CURSOR's walk — the dashboard
  // renders the same builder's full row list.
  const walk = useMemo<InventoryRow[]>(
    () => (state.phase === 'ok' ? selectableRows(state.view.groups, collapsedIds) : []),
    [state, collapsedIds]
  );

  // Walk rows as minimal menu items: containers of expanded groups, plus
  // collapsed group rows — a closed group's row is the handle that reopens
  // it. Expanded group rows are headers and stay out of the walk.
  const items = useMemo<ActionItem[]>(
    () =>
      walk.map(row =>
        row.kind === 'container'
          ? { id: row.container.id, label: row.container.name, command: row.container.name, kind: 'action' as const }
          : {
              id: `${GROUP_ID_PREFIX}${row.group.id}`,
              label: row.group.name,
              command: row.group.name,
              kind: 'action' as const,
            }
      ),
    [walk]
  );

  // Enter/l: a focused COLLAPSED group row expands its group; a focused
  // container keeps the intentional no-op select (the detail panel tracks
  // the cursor).
  const selectRow = (item: ActionItem | undefined): void => {
    if (item === undefined || !item.id.startsWith(GROUP_ID_PREFIX)) return;

    toggleGroup(item.id.slice(GROUP_ID_PREFIX.length));
  };

  const { cursor } = useMenuList({ selectable: items, onSelect: selectRow }, state.phase === 'ok');

  // The page's SINGLE hints writer, driven by the focused row's kind: a
  // container row advertises logs, a collapsed group row space only.
  const focusedRow = walk[cursor];
  const hints = useMemo<readonly KeyHint[]>(() => {
    if (state.phase !== 'ok') return NO_HINTS;

    return focusedRow?.kind === 'container' ? CONTAINER_HINTS : GROUP_HINTS;
  }, [state.phase, focusedRow]);
  usePageHints(hints);

  const navigate = useNavigate();

  // space: a focused container collapses its owning group; a focused
  // collapsed group row expands it — both are the toggle of the focused
  // row's group. No sticky state, no refs: the collapsed row itself is
  // navigable, so reopening is always one cursor move away.
  // l: a focused CONTAINER navigates to its live logs. Ink broadcasts each
  // key to ALL useInput hooks — useMenuList's own `l`-select ALSO fires: on
  // container rows that select is an intentional no-op, on collapsed group
  // rows it expands the group. This handler must therefore stay a no-op
  // unless a container row holds the cursor.
  useKeyBindings(
    {
      chars: {
        ' ': () => {
          const focused = walk[cursor];

          if (focused !== undefined) toggleGroup(focused.group.id);
        },
        l: () => {
          const focused = walk[cursor];

          if (focused?.kind !== 'container') return;

          navigate(`/logs?container=${encodeURIComponent(focused.container.name)}`);
        },
      },
    },
    { isActive: state.phase === 'ok' }
  );

  // Guard (after hooks, per hooks rules): activation always lands here with
  // a remote; the impossible no-remote case renders nothing.
  if (remote === '') {
    return <></>;
  }

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      <Box height={2} />

      {/* Tab strip: Services active (bold cyan, 2px cyan underline), Global
          actions inactive (dim, dim underline). Switching tabs is a later
          iteration — this row is static. */}
      <Box columnGap={3}>
        <Box flexDirection='column'>
          <Text>
            <Text bold dimColor>
              1
            </Text>
            <Text bold color='cyan'>
              {` Services`}
            </Text>
          </Text>
          <Text color='cyan'>{'──'}</Text>
        </Box>
        <Box flexDirection='column'>
          <Text>
            <Text bold dimColor>
              2
            </Text>
            <Text dimColor>{` Global actions`}</Text>
          </Text>
          <Text dimColor>{'──'}</Text>
        </Box>
      </Box>

      <Divider />

      {state.phase === 'loading' && <RemoteHomeLoading remote={remote} />}
      {state.phase === 'ok' && <RemoteHomeDashboard view={state.view} collapsedIds={collapsedIds} cursor={cursor} />}
      {state.phase === 'empty' && <RemoteHomeEmpty remote={remote} />}
      {state.phase === 'error' && <RemoteHomeError reason={state.reason} />}
    </Box>
  );
}
