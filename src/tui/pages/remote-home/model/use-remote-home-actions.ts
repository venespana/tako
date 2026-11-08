// use-remote-home-actions.ts — The remote-home hub's ACTIONS surface as one
// model-layer hook: the list↔actions pane state, the selection lock
// (published to the pane-lock store so useGlobalKeys stands down its back
// keys), the action cursor with wrap-around, the in-panel command feedback
// (dim running line / red refusal reason), and the whole pane keyboard —
// Enter/→ locks onto a focused container, ↑↓ walk the ACTIONS list, Enter
// runs the focused action (view-logs navigates; start/restart executes over
// SSH with re-entry ignored and a success refresh), ←/Esc/h unlock, and
// space/l stay list-pane-only. It also derives the footer hints and the
// locked container's id the dashboard accent-paints. Composition stays in
// the page: the data fetch, the cursor walk, the menu list and collapse
// toggling arrive as options (collapse state stays page-owned and reaches
// the keyboard through `onToggleGroup`).
import { useEffect, useMemo, useState } from 'react';

import { useNavigate } from 'react-router';

import { containerActionLabel, lockedContainerId, wrapIndex } from './remote-home.js';
import type { ContainerAction, ContainerCommand, ContainerEntry, InventoryRow } from './remote-home.js';
import { runContainerLifecycle } from '../../../../services/docker.js';
import type { KeyHint } from '../../../shared/lib/page-hints-store.js';
import { usePaneLockStore } from '../../../shared/lib/pane-lock-store.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';

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

export interface UseRemoteHomeActionsOptions {
  /** Active remote name (the SSH target for start/restart). */
  remote: string;
  /** Connect-time password for the active remote (session-only). */
  sessionPassword: string | undefined;
  /** The ok-phase view's ACTIONS list; empty outside the ok phase. */
  actions: ContainerAction[];
  /** The page's cursor walk (containers of expanded groups + collapsed
   * group rows) — the keyboard reads the focused row from it. */
  walk: InventoryRow[];
  /** The menu list's cursor index into `walk`. */
  cursor: number;
  /** The ok-phase flag: false makes the keyboard a full no-op (loading,
   * empty, error phases) and collapses the hints to none. */
  isActive: boolean;
  /** Re-run the container fetch after a successful lifecycle command. */
  refresh: () => void;
  /** Toggle a group's collapsed state (space on any focused row, → on a
   * collapsed group row) — collapse state stays page-owned. */
  onToggleGroup: (groupId: string) => void;
}

export interface RemoteHomeActionsModel {
  /** Which pane owns the keyboard: the container list or the ACTIONS list. */
  pane: 'list' | 'actions';
  /** The ACTIONS-pane cursor index (locked mode). */
  actionCursor: number;
  /** In-panel lifecycle feedback (running line / refusal reason). */
  command: ContainerCommand | undefined;
  /** The locked container's id (the dashboard paints its name in the
   * accent color); undefined in the list pane. */
  selectedContainerId: string | undefined;
  /** Footer hints for the current pane and focused row kind — the page
   * publishes them via usePageHints (one writer per mounted surface). */
  hints: readonly KeyHint[];
}

/**
 * The hub's ACTIONS surface (iteration 3, extracted from the page): pane
 * lock, action cursor, command feedback, the pane keyboard, footer hints
 * and the locked container's id. The keyboard keeps the page's exact
 * dispatch (same guards, same `isActive`), so the extraction is a pure
 * move — behavior lives here, composition lives in the page.
 */
export function useRemoteHomeActions({
  remote,
  sessionPassword,
  actions,
  walk,
  cursor,
  isActive,
  refresh,
  onToggleGroup,
}: UseRemoteHomeActionsOptions): RemoteHomeActionsModel {
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

  const navigate = useNavigate();

  // The hints decision, driven by the pane and the focused row's kind: the
  // locked pane advertises pick/run/back, a container row select/logs, a
  // collapsed group row space only (none outside the ok phase). The page
  // stays the single WRITER via usePageHints.
  const focusedRow = walk[cursor];
  const hints = useMemo<readonly KeyHint[]>(() => {
    if (!isActive) return NO_HINTS;

    if (pane === 'actions') return ACTIONS_HINTS;

    return focusedRow?.kind === 'container' ? CONTAINER_HINTS : GROUP_HINTS;
  }, [isActive, pane, focusedRow]);

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

  // The hook owns the LOCK keyboard (iteration 3). Ink broadcasts every key
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
        else onToggleGroup(focused.group.id);
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

          if (focused !== undefined) onToggleGroup(focused.group.id);
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
    { isActive }
  );

  return {
    pane,
    actionCursor,
    command,
    selectedContainerId: lockedContainerId(pane, focusedRow),
    hints,
  };
}
