// remote-home.ts — Pure view model for the Home/Remote hub screen (pen
// frame "Screen - Home / Remote", iteration 2): groups the ACTIVE remote's
// REAL containers by compose project (the label-less ones land in an Others
// bucket kept last), maps docker states onto the design's three lights, and
// computes the section totals from the collection (never hand-maintained)
// so the meta can never drift from the rendered rows. No React, no I/O.
import type { ContainerHealth, ContainerSnapshot } from '../../../../services/docker.js';

/** Re-exported for the page's UI layer (the health badge palette key). */
export type { ContainerHealth };

export type ContainerStatus = 'running' | 'exited' | 'paused';

/** One docker container as the hub screen shows it. */
export interface ContainerEntry {
  id: string;
  name: string;
  status: ContainerStatus;
  /** Healthcheck outcome; undefined when the container has no healthcheck
   * (or the field was foreign) — nothing renders for it. */
  health?: ContainerHealth | null;
}

/** A service group: one compose project's stack, or the ad-hoc "Others"
 * bucket when `composeProject` is null. */
export interface ServiceGroup {
  id: string;
  name: string;
  composeProject: string | null;
  expanded: boolean;
  containers: ContainerEntry[];
}

/** A container action offered by the detail panel. */
export interface ContainerAction {
  id: string;
  label: string;
  key: string;
}

/** In-panel feedback for one lifecycle run while/after it executes: a dim
 * running line while the command is in flight, the red refusal reason when
 * the remote refused. Undefined means no command feedback to show. */
export type ContainerCommand =
  { readonly phase: 'running'; readonly verb: string } | { readonly phase: 'error'; readonly reason: string };

/** View data for one rendering of the hub screen (derived from real containers). */
export interface RemoteHomeView {
  totalContainers: number;
  runningContainers: number;
  groups: ServiceGroup[];
  actions: ContainerAction[];
}

const OTHERS_GROUP_ID = 'others';
const OTHERS_GROUP_NAME = 'Others';

/** The detail-panel action lists in display order. Stop is offered ONLY
 * while the container can stop (running/paused); an exited container has
 * nothing to stop — it gets Start instead (the restart action's label
 * follows the status). */
const BASE_CONTAINER_ACTIONS: readonly ContainerAction[] = [
  { id: 'view-logs', label: 'View logs', key: 'l' },
  { id: 'restart', label: 'Restart', key: 'r' },
  { id: 'inspect', label: 'Inspect', key: 'i' },
];

const STOPPABLE_CONTAINER_ACTIONS: readonly ContainerAction[] = [
  { id: 'view-logs', label: 'View logs', key: 'l' },
  { id: 'restart', label: 'Restart', key: 'r' },
  { id: 'stop', label: 'Stop', key: 's' },
  { id: 'inspect', label: 'Inspect', key: 'i' },
];

/** Per-status ACTIONS builder (T2-container-stop): `undefined` is the
 * no-container case (group rows) — the base list without Stop. */
const ACTIONS_BY_STATUS: Record<ContainerStatus, readonly ContainerAction[]> = {
  running: STOPPABLE_CONTAINER_ACTIONS,
  paused: STOPPABLE_CONTAINER_ACTIONS,
  exited: BASE_CONTAINER_ACTIONS,
};

/** The ACTIONS list for one focused container status; a fresh array per
 * call, so callers can never mutate the shared lists. */
export function containerActionsFor(status: ContainerStatus | undefined): ContainerAction[] {
  const actions = status === undefined ? BASE_CONTAINER_ACTIONS : ACTIONS_BY_STATUS[status];

  return [...actions];
}

/** Typed lookup for the two states with their own light; everything else
 * (exited, created, restarting, dead…) falls back to the exited light. */
const STATUS_LIGHTS: Record<string, ContainerStatus> = { running: 'running', paused: 'paused' };

/** Map a raw docker ps state onto the design's three lights. */
function toContainerStatus(state: string): ContainerStatus {
  return STATUS_LIGHTS[state] ?? 'exited';
}

const byName = (a: ContainerEntry, b: ContainerEntry): number => a.name.localeCompare(b.name);

/** Compact per-group summary for the group row: "3/3" running/total for
 * compose groups, "2 · no compose" for the ad-hoc Others group. */
export function groupSummary(group: ServiceGroup): string {
  const running = group.containers.filter(container => container.status === 'running').length;

  return group.composeProject === null ? `${running} · no compose` : `${running}/${group.containers.length}`;
}

/**
 * The detail-panel label for one action given the focused container's
 * status (iteration 3): the 'restart' action STARTS a stopped (exited)
 * container and restarts anything else, so its label follows the status.
 * 'stop' is only OFFERED for running/paused containers
 * (containerActionsFor); when it appears its label stays 'Stop'. Every
 * other action keeps its own static label.
 */
export function containerActionLabel(action: ContainerAction, status: ContainerStatus): string {
  if (action.id !== 'restart') return action.label;

  return status === 'exited' ? 'Start' : 'Restart';
}

/**
 * Wrapped cursor movement over a fixed-length list (+1 down, -1 up): past
 * the last index wraps to 0, below 0 wraps to the last index. An empty list
 * always yields 0 — nothing to focus. Same rule as the menu feature's
 * moveCursor, shaped for plain indices (the action list is moved by index,
 * not by ActionItem[]).
 */
export function wrapIndex(index: number, length: number, dir: 1 | -1): number {
  if (length === 0) return 0;

  const next = index + dir;

  if (next < 0) return length - 1;

  if (next >= length) return 0;

  return next;
}

/**
 * Group containers by compose project: one group per project, sorted
 * alphabetically, every group expanded; label-less containers land in the
 * Others group, kept last and only when non-empty. Containers sort by name
 * inside each group.
 */
export function toServiceGroups(containers: readonly ContainerSnapshot[]): ServiceGroup[] {
  const byProject = new Map<string, ContainerEntry[]>();
  const others: ContainerEntry[] = [];

  containers.forEach(snapshot => {
    const entry: ContainerEntry = {
      id: snapshot.id,
      name: snapshot.name,
      status: toContainerStatus(snapshot.state),
      health: snapshot.health ?? undefined,
    };

    if (snapshot.composeProject === null) {
      others.push(entry);

      return;
    }

    const bucket = byProject.get(snapshot.composeProject);

    if (bucket === undefined) byProject.set(snapshot.composeProject, [entry]);
    else bucket.push(entry);
  });

  const composeGroups = [...byProject.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([project, entries]) => ({
      id: project,
      name: project,
      composeProject: project,
      expanded: true,
      containers: [...entries].sort(byName),
    }));

  if (others.length === 0) return composeGroups;

  return [
    ...composeGroups,
    {
      id: OTHERS_GROUP_ID,
      name: OTHERS_GROUP_NAME,
      composeProject: null,
      expanded: true,
      containers: [...others].sort(byName),
    },
  ];
}

/** The full hub view for a container collection: grouped rows plus totals
 * computed from the same collection and the base (no-container) action
 * list — the page derives the per-status list for the focused container. */
export function toRemoteHomeView(containers: readonly ContainerSnapshot[]): RemoteHomeView {
  const groups = toServiceGroups(containers);
  const flat = groups.flatMap(group => group.containers);

  return {
    totalContainers: flat.length,
    runningContainers: flat.filter(container => container.status === 'running').length,
    groups,
    actions: containerActionsFor(undefined),
  };
}

/**
 * The locked container's id while the ACTIONS pane holds the keyboard — the
 * dashboard paints that row's NAME in the accent color (the status dot keeps
 * its own light). Undefined in the list pane (the cursor column alone marks
 * focus) and on group rows.
 */
export function lockedContainerId(pane: 'list' | 'actions', row: InventoryRow | undefined): string | undefined {
  return pane === 'actions' && row?.kind === 'container' ? row.container.id : undefined;
}

/**
 * The flat row list the page's cursor walks: every container of an expanded
 * group plus every COLLAPSED group row — a closed group's row is the
 * markable handle that reopens it. Expanded group rows are headers:
 * rendered, never selectable. Same builder the dashboard renders, so cursor
 * and render can never disagree.
 */
export function selectableRows(groups: readonly ServiceGroup[], collapsedIds: ReadonlySet<string>): InventoryRow[] {
  return buildInventoryRows(groups, collapsedIds).flatMap(row =>
    row.kind === 'container' || collapsedIds.has(row.group.id) ? [row] : []
  );
}

/** One row of the hub's inventory list: a group header or one of its
 * containers — the cursor walks both kinds (collapsible groups iteration). */
export type InventoryRow =
  { kind: 'group'; group: ServiceGroup } | { kind: 'container'; group: ServiceGroup; container: ContainerEntry };

/**
 * The flat row list the page's cursor walks, in render order: one group row
 * per group, then that group's container rows. A collapsed group (id in
 * `collapsedIds`, or `expanded: false`) contributes its group row only —
 * rows and the ▼/▶ glyph share this same effective expanded state.
 */
export function buildInventoryRows(groups: readonly ServiceGroup[], collapsedIds: ReadonlySet<string>): InventoryRow[] {
  return groups.flatMap(group => {
    const row: InventoryRow = { kind: 'group', group };

    if (!group.expanded || collapsedIds.has(group.id)) return [row];

    return [row, ...group.containers.map(container => ({ kind: 'container' as const, group, container }))];
  });
}
