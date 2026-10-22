// remote-home.test.ts — Pure view-model tests for the Home/Remote hub
// (iteration 2): docker ps states map onto the design's three lights,
// containers group by compose project with the Others bucket LAST, groups
// sort alphabetically and always render expanded, and totals compute from
// the collection (never hand-maintained).
import { describe, expect, it } from 'vitest';

import { buildInventoryRows, groupSummary, selectableRows, toRemoteHomeView, toServiceGroups } from './remote-home.js';
import type { InventoryRow } from './remote-home.js';
import type { ContainerSnapshot } from '../../../../services/docker.js';

const snapshot = (name: string, overrides: Partial<ContainerSnapshot> = {}): ContainerSnapshot => ({
  id: `id-${name}`,
  name,
  state: 'running',
  composeProject: null,
  ...overrides,
});

describe('toServiceGroups — grouping by compose project', () => {
  it('creates one group per compose project, sorted alphabetically', () => {
    const groups = toServiceGroups([
      snapshot('caddy', { id: '1', composeProject: 'proxy' }),
      snapshot('grafana', { id: '2', composeProject: 'monitoring' }),
      snapshot('prometheus', { id: '3', composeProject: 'monitoring' }),
    ]);

    expect(groups.map(group => group.name)).toEqual(['monitoring', 'proxy']);
    expect(groups.map(group => group.composeProject)).toEqual(['monitoring', 'proxy']);
  });

  it('parks label-less containers in an Others group kept LAST', () => {
    const groups = toServiceGroups([
      snapshot('zabbix-agent', { id: '1', composeProject: 'monitoring' }),
      snapshot('portainer', { id: '2' }),
      snapshot('watchtower', { id: '3' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.name).toBe('monitoring');
    expect(groups[1]?.name).toBe('Others');
    expect(groups[1]?.composeProject).toBeNull();
    expect(groups[1]?.containers.map(container => container.name)).toEqual(['portainer', 'watchtower']);
  });

  it('omits the Others group when every container has a compose project', () => {
    const groups = toServiceGroups([snapshot('caddy', { id: '1', composeProject: 'proxy' })]);

    expect(groups.map(group => group.name)).toEqual(['proxy']);
  });

  it('sorts containers by name inside each group', () => {
    const groups = toServiceGroups([
      snapshot('web', { id: '1', composeProject: 'media' }),
      snapshot('api', { id: '2', composeProject: 'media' }),
      snapshot('db', { id: '3', composeProject: 'media' }),
    ]);

    expect(groups[0]?.containers.map(container => container.name)).toEqual(['api', 'db', 'web']);
  });

  it('expands every group (iteration 2 has no collapse interaction)', () => {
    const groups = toServiceGroups([
      snapshot('caddy', { id: '1', composeProject: 'proxy' }),
      snapshot('portainer', { id: '2' }),
    ]);

    expect(groups.map(group => group.expanded)).toEqual([true, true]);
  });

  it('returns no groups for an empty container collection', () => {
    expect(toServiceGroups([])).toEqual([]);
  });
});

describe('toServiceGroups — status mapping (the design’s three lights)', () => {
  it('keeps running and paused, and maps every other docker state to exited', () => {
    const states = ['running', 'paused', 'exited', 'created', 'restarting', 'dead', 'removing'];
    const groups = toServiceGroups(states.map((state, index) => snapshot(state, { id: String(index), state })));
    const byName = new Map(groups[0]!.containers.map(container => [container.name, container.status]));

    expect(byName.get('running')).toBe('running');
    expect(byName.get('paused')).toBe('paused');
    expect(['exited', 'created', 'restarting', 'dead', 'removing'].map(state => byName.get(state))).toEqual([
      'exited',
      'exited',
      'exited',
      'exited',
      'exited',
    ]);
  });
});

describe('toRemoteHomeView', () => {
  it('computes totals from the collection (paused is not running)', () => {
    const view = toRemoteHomeView([
      snapshot('caddy', { id: '1', composeProject: 'proxy' }),
      snapshot('restic', { id: '2', state: 'exited', composeProject: 'backup' }),
      snapshot('qbittorrent', { id: '3', state: 'paused', composeProject: 'downloads' }),
      snapshot('portainer', { id: '4' }),
    ]);

    expect(view.totalContainers).toBe(4);
    expect(view.runningContainers).toBe(2);
  });

  it('carries the four static detail-panel actions in order', () => {
    const view = toRemoteHomeView([]);

    expect(view.actions.map(action => action.label)).toEqual(['View logs', 'Restart', 'Stop', 'Inspect']);
    expect(view.groups).toEqual([]);
  });
});

describe('groupSummary', () => {
  it('summarizes compose groups as running/total and Others as "N · no compose"', () => {
    const view = toRemoteHomeView([
      snapshot('caddy', { id: '1', composeProject: 'proxy' }),
      snapshot('restic', { id: '2', state: 'exited', composeProject: 'backup' }),
      snapshot('portainer', { id: '3' }),
      snapshot('watchtower', { id: '4', state: 'paused' }),
    ]);
    const byName = new Map(view.groups.map(group => [group.name, group]));

    expect(groupSummary(byName.get('proxy')!)).toBe('1/1');
    expect(groupSummary(byName.get('backup')!)).toBe('0/1');
    expect(groupSummary(byName.get('Others')!)).toBe('1 · no compose');
  });
});

describe('buildInventoryRows', () => {
  const view = toRemoteHomeView([
    snapshot('prometheus', { id: '1', composeProject: 'monitoring' }),
    snapshot('grafana', { id: '2', state: 'exited', composeProject: 'monitoring' }),
    snapshot('caddy', { id: '3', composeProject: 'proxy' }),
    snapshot('portainer', { id: '4' }),
  ]);
  const groups = view.groups;
  const monitoring = groups[0]!;
  const proxy = groups[1]!;

  /** Compact kind/name shape so every assertion reads as render order. */
  const shape = (rows: InventoryRow[]): string[] =>
    rows.map(row =>
      row.kind === 'group' ? `group:${row.group.name}` : `container:${row.group.name}/${row.container.name}`
    );

  it('walks group rows then container rows in render order, Others LAST', () => {
    const rows = buildInventoryRows(view.groups, new Set());

    expect(shape(rows)).toEqual([
      'group:monitoring',
      'container:monitoring/grafana',
      'container:monitoring/prometheus',
      'group:proxy',
      'container:proxy/caddy',
      'group:Others',
      'container:Others/portainer',
    ]);
    expect(rows[0]).toEqual({ kind: 'group', group: monitoring });
    expect(rows[1]).toEqual({
      kind: 'container',
      group: monitoring,
      container: { id: '2', name: 'grafana', status: 'exited' },
    });
  });

  it('carries the owning group on each container row', () => {
    const rows = buildInventoryRows(view.groups, new Set());
    const ownerNames = rows.flatMap(row => (row.kind === 'container' ? [row.group.name] : []));

    expect(ownerNames).toEqual(['monitoring', 'monitoring', 'proxy', 'Others']);
  });

  it('a collapsed group contributes only its group row', () => {
    const rows = buildInventoryRows(view.groups, new Set(['monitoring']));

    expect(shape(rows)).toEqual([
      'group:monitoring',
      'group:proxy',
      'container:proxy/caddy',
      'group:Others',
      'container:Others/portainer',
    ]);
  });

  it('toggling the collapsed set back restores the container rows', () => {
    const collapsed = new Set<string>(['monitoring']);
    const collapsedShape = shape(buildInventoryRows(view.groups, collapsed));

    expect(collapsedShape).not.toContain('container:monitoring/grafana');

    // The page toggles through a Set copy (updater form): delete then rebuild.
    const toggled = new Set(collapsed);
    toggled.delete('monitoring');

    expect(shape(buildInventoryRows(view.groups, toggled))).toEqual(shape(buildInventoryRows(view.groups, new Set())));
  });

  it('collapsing every group leaves zero container rows (group rows only)', () => {
    const all = new Set(view.groups.map(group => group.id));
    const rows = buildInventoryRows(view.groups, all);

    expect(shape(rows)).toEqual(['group:monitoring', 'group:proxy', 'group:Others']);
    expect(rows.every(row => row.kind === 'group')).toBe(true);
  });

  it('treats expanded: false as collapsed too (the effective expanded state)', () => {
    const shut = { ...proxy, expanded: false };

    expect(shape(buildInventoryRows([shut, monitoring], new Set()))).toEqual([
      'group:proxy',
      'group:monitoring',
      'container:monitoring/grafana',
      'container:monitoring/prometheus',
    ]);
  });

  it('returns no rows for an empty group collection', () => {
    expect(buildInventoryRows([], new Set())).toEqual([]);
  });
});

describe('selectableRows', () => {
  const view = toRemoteHomeView([
    snapshot('prometheus', { id: '1', composeProject: 'monitoring' }),
    snapshot('grafana', { id: '2', state: 'exited', composeProject: 'monitoring' }),
    snapshot('caddy', { id: '3', composeProject: 'proxy' }),
    snapshot('portainer', { id: '4' }),
  ]);

  /** Compact kind/name shape so every assertion reads as walk order. */
  const shape = (rows: InventoryRow[]): string[] =>
    rows.map(row =>
      row.kind === 'group' ? `group:${row.group.name}` : `container:${row.group.name}/${row.container.name}`
    );

  it('walks only containers while every group is expanded (headers stay out)', () => {
    expect(shape(selectableRows(view.groups, new Set()))).toEqual([
      'container:monitoring/grafana',
      'container:monitoring/prometheus',
      'container:proxy/caddy',
      'container:Others/portainer',
    ]);
  });

  it('a collapsed group contributes its group row INSTEAD of its containers', () => {
    const rows = selectableRows(view.groups, new Set(['monitoring']));

    expect(shape(rows)).toEqual(['group:monitoring', 'container:proxy/caddy', 'container:Others/portainer']);
  });

  it('a collapsed group row carries the group (the handle that reopens it)', () => {
    const rows = selectableRows(view.groups, new Set(['monitoring']));

    expect(rows[0]).toEqual({ kind: 'group', group: view.groups[0] });
  });

  it('collapsing every group leaves only group rows, all selectable', () => {
    const all = new Set(view.groups.map(group => group.id));

    expect(shape(selectableRows(view.groups, all))).toEqual(['group:monitoring', 'group:proxy', 'group:Others']);
  });
});
