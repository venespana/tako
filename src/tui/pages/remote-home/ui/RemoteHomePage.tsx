// RemoteHomePage.tsx — The Home/Remote hub screen (pen frame
// "Screen - Home / Remote"): static tab strip (Services active), the state
// views over useRemoteHome (the active remote's REAL containers), and the
// cursor-owned composition — the cursor walks the containers of expanded
// groups PLUS collapsed group rows via the shared menu list (↑↓), space
// collapses a focused container's group / expands a focused collapsed
// group, `l` on a focused CONTAINER opens its live logs (tui-live-logs),
// and the detail panel tracks the cursor. Iteration 3 adds the selection
// lock: Enter/→ on a focused container freezes the list cursor and moves
// the keyboard into the right ACTIONS list (↑↓ pick, Enter runs — logs
// navigation or the start/restart command —, ←/Esc unlocks). Logo,
// active-remote header and footer are app-shell chrome; tab switching and
// the remaining container actions are later iterations.
import { useMemo, useState, useEffect } from 'react';

import { Box, Text } from 'ink';

import { useNavigate } from 'react-router';

import { Divider } from './Divider.js';
import { RemoteHomeDashboard } from './RemoteHomeDashboard.js';
import { RemoteHomeEmpty } from './RemoteHomeEmpty.js';
import { RemoteHomeError } from './RemoteHomeError.js';
import { RemoteHomeLoading } from './RemoteHomeLoading.js';
import { runContainerLifecycle } from '../../../../services/docker.js';
import { useMenuList } from '../../../features/menu/index.js';
import type { ActionItem } from '../../../features/menu/index.js';
import type { KeyHint } from '../../../shared/lib/page-hints-store.js';
import { usePageHints } from '../../../shared/lib/page-hints-store.js';
import { usePaneLockStore } from '../../../shared/lib/pane-lock-store.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';
import { containerActionLabel, lockedContainerId, selectableRows, wrapIndex } from '../model/remote-home.js';
import type { ContainerCommand, ContainerEntry, InventoryRow } from '../model/remote-home.js';
import { useRemoteHome } from '../model/use-remote-home.js';

// Identity-stable hint constants (usePageHints effect dep) — a fresh literal
// per render would re-publish on every render (9.10 lesson). Container rows
// advertise select/logs; group rows (and every non-ok phase) advertise
// space only; the locked ACTIONS pane owns its own trio.
const CONTAINER_HINTS: readonly KeyHint[] = [
  { key: 'enter', label: 'select' },
  { key: 'space', label: 'collapse/expand' },
  { key: 'l', label: 'logs' },
];
const GROUP_HINTS: readonly KeyHint[] = [{ key: 'space', label: 'collapse/expand' }];
const ACTIONS_HINTS: readonly KeyHint[] = [
  { key: 'arrows', label: 'pick' },
  { key: 'enter', label: 'run' },
  { key: 'esc', label: 'back' },
];
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
  const { state, refresh } = useRemoteHome({ remote, sessionPassword, enabled: remote !== '' });

  // Collapse state lives HERE, not in the view model: everything starts
  // expanded and the updater form never reads stale state (no effect ever
  // writes it).
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());

  // Selection lock (iteration 3): the left list owns the keyboard in the
  // 'list' pane; locking onto a container moves it to the right ACTIONS
  // list. A successful command resets both here (the loading phase of the
  // refresh deactivates every binding in between). The pane-lock STORE
  // publishes the lock globally: while it holds, useGlobalKeys suppresses
  // its back keys (Esc/h/⌫) so unlocking never also navigates away.
  const [pane, setPane] = useState<'list' | 'actions'>('list');
  const [actionCursor, setActionCursor] = useState(0);
  const [command, setCommand] = useState<ContainerCommand | undefined>(undefined);

  // The lock also tells the GLOBAL keyboard to stand down: while it holds,
  // useGlobalKeys suppresses back (Esc/h/⌫) so unlocking never navigates
  // away (quit stays live). Released on unlock, on a successful command and
  // on unmount (route-leave while locked, e.g. the view-logs action).
  const setLocked = usePaneLockStore(store => store.setLocked);

  useEffect(() => () => setLocked(false), [setLocked]);

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

  // The menu list is the LIST pane's keyboard: inactive while locked, so
  // its up/down/select keys can never double-fire with the ACTIONS pane's.
  const { cursor } = useMenuList({ selectable: items, onSelect: selectRow }, state.phase === 'ok' && pane === 'list');

  // The page's SINGLE hints writer, driven by the pane and the focused
  // row's kind: the locked pane advertises pick/run/back, a container row
  // select/logs, a collapsed group row space only.
  const focusedRow = walk[cursor];
  const hints = useMemo<readonly KeyHint[]>(() => {
    if (state.phase !== 'ok') return NO_HINTS;

    if (pane === 'actions') return ACTIONS_HINTS;

    return focusedRow?.kind === 'container' ? CONTAINER_HINTS : GROUP_HINTS;
  }, [state.phase, pane, focusedRow]);
  usePageHints(hints);

  const navigate = useNavigate();

  const actions = state.phase === 'ok' ? state.view.actions : [];

  const lock = (): void => {
    setPane('actions');
    setActionCursor(0);
    setCommand(undefined);
    setLocked(true);
  };

  const unlock = (): void => {
    setPane('list');
    setCommand(undefined);
    setLocked(false);
  };

  // The restart action runs over SSH: a stopped (exited) container STARTS,
  // anything else RESTARTS. While a command runs the panel shows a dim
  // line and re-entry is ignored; a refusal keeps the lock with the red
  // reason; success refreshes the list (and resets the pane above).
  const runLifecycle = (container: ContainerEntry): void => {
    if (command?.phase === 'running') return;

    const restartAction = actions.find(action => action.id === 'restart');

    if (restartAction === undefined) return;

    setCommand({ phase: 'running', verb: containerActionLabel(restartAction, container.status) });
    void runContainerLifecycle({
      remote,
      sessionPassword,
      container: container.name,
      op: container.status === 'exited' ? 'start' : 'restart',
    }).then(outcome => {
      if (outcome.kind !== 'ok') {
        setCommand({ phase: 'error', reason: outcome.reason });

        return;
      }

      setCommand(undefined);
      setPane('list');
      setActionCursor(0);
      setLocked(false);
      refresh();
    });
  };

  // The ACTIONS pane's confirm: logs navigates, start/restart executes,
  // stop/inspect stay visible but inert (later iterations).
  const runFocusedAction = (): void => {
    if (focusedRow?.kind !== 'container') return;

    const action = actions[actionCursor];

    if (action === undefined) return;

    if (action.id === 'view-logs') {
      navigate(`/logs?container=${encodeURIComponent(focusedRow.container.name)}`);

      return;
    }

    if (action.id === 'restart') runLifecycle(focusedRow.container);
  };

  // The page owns the LOCK keyboard (iteration 3). Ink broadcasts every key
  // to ALL active useInput hooks — in the 'list' pane the menu list (still
  // active) and this hook coexist: the menu's Enter/l select is an
  // intentional no-op on container rows and expands collapsed group rows,
  // so this hook's confirm must lock CONTAINER rows only (never group rows,
  // or the broadcast would expand twice). In the 'actions' pane the menu
  // list is INACTIVE and this hook alone handles movement, run and unlock;
  // the list keys (space, l) stay list-pane-only.
  useKeyBindings(
    {
      moveUp: () => {
        if (pane !== 'actions') return;

        setActionCursor(previous => wrapIndex(previous, actions.length, -1));
      },
      moveDown: () => {
        if (pane !== 'actions') return;

        setActionCursor(previous => wrapIndex(previous, actions.length, 1));
      },
      moveLeft: () => {
        if (pane !== 'actions') return;

        unlock();
      },
      moveRight: () => {
        if (pane !== 'list') return;

        const focused = walk[cursor];

        if (focused === undefined) return;

        // A container locks; a collapsed group row behaves like Enter there
        // (expand — the menu list has no → binding, so this owns it).
        if (focused.kind === 'container') lock();
        else toggleGroup(focused.group.id);
      },
      confirm: () => {
        if (pane === 'actions') {
          runFocusedAction();

          return;
        }

        if (focusedRow?.kind === 'container') lock();
      },
      cancel: () => {
        if (pane !== 'actions') return;

        unlock();
      },
      chars: {
        ' ': () => {
          if (pane !== 'list') return;

          const focused = walk[cursor];

          if (focused !== undefined) toggleGroup(focused.group.id);
        },
        l: () => {
          if (pane !== 'list') return;

          const focused = walk[cursor];

          if (focused?.kind !== 'container') return;

          navigate(`/logs?container=${encodeURIComponent(focused.container.name)}`);
        },
        // Vim-left parity with moveLeft: while locked, h unlocks (the
        // global back-h is suppressed meanwhile). The list pane keeps the
        // global h → back semantics — this binding no-ops there.
        h: () => {
          if (pane !== 'actions') return;

          unlock();
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

  // While locked onto a container, the dashboard paints that row's NAME in
  // the accent color and moves the ACTIONS cursor.
  const selectedId = lockedContainerId(pane, focusedRow);

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
          actionCursor={pane === 'actions' ? actionCursor : undefined}
          collapsedIds={collapsedIds}
          command={command}
          cursor={cursor}
          selectedContainerId={selectedId}
          view={state.view}
        />
      )}
      {state.phase === 'empty' && <RemoteHomeEmpty remote={remote} />}
      {state.phase === 'error' && <RemoteHomeError reason={state.reason} />}
    </Box>
  );
}
