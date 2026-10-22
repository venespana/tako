// remote-home.ts — Pure view model for the Home/Remote hub screen (pen
// frame "Screen - Home / Remote", iteration 2): groups the ACTIVE remote's
// REAL containers by compose project (the label-less ones land in an Others
// bucket kept last), maps docker states onto the design's three lights, and
// computes the section totals from the collection (never hand-maintained)
// so the meta can never drift from the rendered rows. No React, no I/O.
import type { ContainerSnapshot } from '../../../../services/docker.js';

export type ContainerStatus = 'running' | 'exited' | 'paused';

/** One docker container as the hub screen shows it. */
export interface ContainerEntry {
  id: string;
  name: string;
  status: ContainerStatus;
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

/** View data for one rendering of the hub screen (derived from real containers). */
export interface RemoteHomeView {
  totalContainers: number;
  runningContainers: number;
  groups: ServiceGroup[];
  actions: ContainerAction[];
}

const OTHERS_GROUP_ID = 'others';
const OTHERS_GROUP_NAME = 'Others';

/** The detail panel's static action list (this iteration's scope). */
const CONTAINER_ACTIONS: readonly ContainerAction[] = [
  { id: 'view-logs', label: 'View logs', key: 'l' },
  { id: 'restart', label: 'Restart', key: 'r' },
  { id: 'stop', label: 'Stop', key: 's' },
  { id: 'inspect', label: 'Inspect', key: 'i' },
];

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
 * computed from the same collection and the static action list. */
export function toRemoteHomeView(containers: readonly ContainerSnapshot[]): RemoteHomeView {
  const groups = toServiceGroups(containers);
  const flat = groups.flatMap(group => group.containers);

  return {
    totalContainers: flat.length,
    runningContainers: flat.filter(container => container.status === 'running').length,
    groups,
    actions: [...CONTAINER_ACTIONS],
  };
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
