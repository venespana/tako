// RemoteHomePage.tsx — The Home/Remote hub screen (pen frame
// "Screen - Home / Remote"): static tab strip (Services active), the state
// views over useRemoteHome (the active remote's REAL containers), and the
// cursor-owned composition — the cursor walks the containers of expanded
// groups PLUS collapsed group rows via the shared menu list (↑↓), space
// collapses a focused container's group / expands a focused collapsed
// group, and the detail panel tracks the cursor. The ACTIONS surface
// (selection lock, action cursor, start/restart command, the pane keyboard
// and the footer hints) lives in the model hook useRemoteHomeActions —
// this file is composition and rendering only. Logo, active-remote header
// and footer are app-shell chrome; tab switching and the remaining
// container actions are later iterations.
import { useMemo, useState } from 'react';

import { Box, Text } from 'ink';

import { Divider } from './Divider.js';
import { RemoteHomeDashboard } from './RemoteHomeDashboard.js';
import { RemoteHomeEmpty } from './RemoteHomeEmpty.js';
import { RemoteHomeError } from './RemoteHomeError.js';
import { RemoteHomeLoading } from './RemoteHomeLoading.js';
import { useMenuList } from '../../../features/menu/index.js';
import type { ActionItem } from '../../../features/menu/index.js';
import { usePageHints } from '../../../shared/lib/page-hints-store.js';
import { usePaneLockStore } from '../../../shared/lib/pane-lock-store.js';
import { selectableRows } from '../model/remote-home.js';
import type { InventoryRow } from '../model/remote-home.js';
import { useRemoteHomeActions } from '../model/use-remote-home-actions.js';
import { useRemoteHome } from '../model/use-remote-home.js';

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
  const { state, refresh } = useRemoteHome({ remote, sessionPassword, enabled: remote !== '' });

  // Collapse state lives HERE, not in the view model: everything starts
  // expanded and the updater form never reads stale state (no effect ever
  // writes it). It reaches the actions hook's keyboard via onToggleGroup.
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

  // The menu list is the LIST pane's keyboard: inactive while the pane lock
  // holds, so its up/down/select keys can never double-fire with the
  // ACTIONS pane's. The gate reads the pane-lock STORE directly — the lock
  // is that store's public signal (committed together with pane in
  // lock/unlock/success, so !locked ⟺ pane === 'list'), and reading it
  // here avoids a cycle: useMenuList owns the cursor the actions hook
  // needs, while the hook owns the pane the menu list needs to gate on.
  const paneLocked = usePaneLockStore(store => store.locked);
  const { cursor } = useMenuList({ selectable: items, onSelect: selectRow }, state.phase === 'ok' && !paneLocked);

  const actions = state.phase === 'ok' ? state.view.actions : [];

  // The ACTIONS surface (selection lock, action cursor, command feedback,
  // pane keyboard, footer hints) — one model-layer hook; the page only
  // publishes its hints and renders its state.
  const model = useRemoteHomeActions({
    remote,
    sessionPassword,
    actions,
    walk,
    cursor,
    isActive: state.phase === 'ok',
    refresh,
    onToggleGroup: toggleGroup,
  });
  usePageHints(model.hints);

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
      {state.phase === 'ok' && (
        <RemoteHomeDashboard
          actionCursor={model.pane === 'actions' ? model.actionCursor : undefined}
          collapsedIds={collapsedIds}
          command={model.command}
          cursor={cursor}
          selectedContainerId={model.selectedContainerId}
          view={state.view}
        />
      )}
      {state.phase === 'empty' && <RemoteHomeEmpty remote={remote} />}
      {state.phase === 'error' && <RemoteHomeError reason={state.reason} />}
    </Box>
  );
}
