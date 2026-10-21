// remote-home.ts — Static view model for the Home/Remote hub screen (pen
// frame "Screen - Home / Remote"). Visibility-only iteration: REMOTE_HOME_
// FIXTURE mirrors the approved mock verbatim — no docker data, no
// interaction state. Totals are COMPUTED from the groups (never
// hand-maintained) so the section meta can never drift from the rendered
// rows. The design's meta row (`14 containers · 12 running`) is authoritative
// for the mock data: it matches the Screen - Status dashboard's canonical
// counts, where the Others bucket carries THREE standalone containers — the
// pen inventory only drew two rows, so uptime-kuma completes the set here.

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

/** Static view data for one rendering of the hub screen. */
export interface RemoteHomeFixture {
  totalContainers: number;
  runningContainers: number;
  groups: ServiceGroup[];
  actions: ContainerAction[];
}

/** Compact per-group summary for the group row: "3/3" running/total for
 * compose groups, "2 · no compose" for the ad-hoc Others group. */
export function groupSummary(group: ServiceGroup): string {
  const running = group.containers.filter(container => container.status === 'running').length;

  return group.composeProject === null ? `${running} · no compose` : `${running}/${group.containers.length}`;
}

const groups: ServiceGroup[] = [
  {
    id: 'media',
    name: 'media',
    composeProject: 'media',
    expanded: true,
    containers: [
      { id: 'media/immich', name: 'immich', status: 'running' },
      { id: 'media/jellyfin', name: 'jellyfin', status: 'running' },
      { id: 'media/plex', name: 'plex', status: 'running' },
    ],
  },
  {
    id: 'proxy',
    name: 'proxy',
    composeProject: 'proxy',
    expanded: false,
    containers: [
      { id: 'proxy/caddy', name: 'caddy', status: 'running' },
      { id: 'proxy/cloudflared', name: 'cloudflared', status: 'running' },
    ],
  },
  {
    id: 'monitoring',
    name: 'monitoring',
    composeProject: 'monitoring',
    expanded: false,
    containers: [
      { id: 'monitoring/prometheus', name: 'prometheus', status: 'running' },
      { id: 'monitoring/grafana', name: 'grafana', status: 'running' },
      { id: 'monitoring/node-exporter', name: 'node-exporter', status: 'running' },
    ],
  },
  {
    id: 'homeassistant',
    name: 'homeassistant',
    composeProject: 'homeassistant',
    expanded: false,
    containers: [{ id: 'homeassistant/homeassistant', name: 'homeassistant', status: 'running' }],
  },
  {
    id: 'backup',
    name: 'backup',
    composeProject: 'backup',
    expanded: false,
    containers: [{ id: 'backup/restic', name: 'restic', status: 'exited' }],
  },
  {
    id: 'downloads',
    name: 'downloads',
    composeProject: 'downloads',
    expanded: false,
    containers: [{ id: 'downloads/qbittorrent', name: 'qbittorrent', status: 'paused' }],
  },
  {
    id: 'others',
    name: 'Others',
    composeProject: null,
    expanded: true,
    containers: [
      { id: 'others/portainer', name: 'portainer', status: 'running' },
      { id: 'others/watchtower', name: 'watchtower', status: 'running' },
      { id: 'others/uptime-kuma', name: 'uptime-kuma', status: 'running' },
    ],
  },
];

const actions: ContainerAction[] = [
  { id: 'view-logs', label: 'View logs', key: 'l' },
  { id: 'restart', label: 'Restart', key: 'r' },
  { id: 'stop', label: 'Stop', key: 's' },
  { id: 'inspect', label: 'Inspect', key: 'i' },
];

const allContainers = groups.flatMap(group => group.containers);

export const REMOTE_HOME_FIXTURE: RemoteHomeFixture = {
  totalContainers: allContainers.length,
  runningContainers: allContainers.filter(container => container.status === 'running').length,
  groups,
  actions,
};
