// RemoteHomePage.test.tsx — Unit tests for the Home/Remote hub skeleton
// (pen frame "Screen - Home / Remote", visibility-only iteration). The page
// renders REMOTE_HOME_FIXTURE verbatim: tab strip, totals line, group rows
// (collapsed groups hide their containers), expanded containers with static
// focus on the first container of the first expanded group, and the detail
// panel's static action list. Logo, active-remote header and footer are
// app-shell chrome and NOT part of this page; the page uses no router this
// iteration.
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { RemoteHomePage } from './RemoteHomePage.js';
import { settle } from '../../../test-utils/ink-interactions.js';
import { groupSummary, REMOTE_HOME_FIXTURE } from '../model/remote-home.js';

const renderPage = () => render(<RemoteHomePage />);

const groupByName = (name: string) => {
  const group = REMOTE_HOME_FIXTURE.groups.find(candidate => candidate.name === name);

  if (group === undefined) throw new Error(`fixture is missing group "${name}"`);

  return group;
};

describe('RemoteHomePage', () => {
  it('renders the tab strip (Servicios active, Global actions inactive)', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('Servicios'), 1000);

    expect(frame).toContain('Servicios');
    expect(frame).toContain('Global actions');
  });

  it('renders the totals line next to the Servicios heading', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('containers'), 1000);

    expect(frame).toContain('14 containers · 12 running');
  });

  it('renders every group row in fixture order with its expand glyph', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('▼ media'), 1000);

    expect(frame).toContain('▼ media');
    expect(frame).toContain('▶ proxy');
    expect(frame).toContain('▶ monitoring');
    expect(frame).toContain('▶ homeassistant');
    expect(frame).toContain('▶ backup');
    expect(frame).toContain('▶ downloads');
    expect(frame).toContain('▼ Others');
  });

  it('renders containers of expanded groups only', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('▼ media'), 1000);

    expect(frame).toContain('immich');
    expect(frame).toContain('jellyfin');
    expect(frame).toContain('plex');
    expect(frame).toContain('portainer');
    expect(frame).toContain('watchtower');

    expect(frame).not.toContain('caddy');
    expect(frame).not.toContain('cloudflared');
    expect(frame).not.toContain('prometheus');
    expect(frame).not.toContain('grafana');
    expect(frame).not.toContain('node-exporter');
    expect(frame).not.toContain('restic');
    expect(frame).not.toContain('qbittorrent');
  });

  it('pins the static cursor to the first container of the first expanded group', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('❯ ● immich'), 1000);

    expect(frame).toContain('❯ ● immich');
    expect(frame).not.toContain('❯ ● jellyfin');
    expect(frame).not.toContain('❯ ● portainer');
  });

  it('marks stalled groups in the group summary rows', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('downloads'), 1000);

    expect(frame).toContain('0/1 · paused');
    expect(frame).toContain('3 · no compose');
  });

  it('renders the detail panel with all four actions, their keys, and the hints', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('ACTIONS'), 1000);

    expect(frame).toMatch(/View logs +l/);
    expect(frame).toMatch(/Restart +r/);
    expect(frame).toMatch(/Stop +s/);
    expect(frame).toMatch(/Inspect +i/);

    expect(frame).toContain('❯ View logs');
    expect(frame).not.toContain('❯ Restart');
    expect(frame).toContain('· media (compose)');
    // The 100-column test terminal wraps the note inside the detail panel
    // (the left column's next row sits between the halves in the raw
    // frame), so assert the wrap-stable fragments; 'stopped' is unique.
    expect(frame).toContain('Start is available when the container is');
    expect(frame).toContain('stopped');
    expect(frame).toContain('↑↓ pick a container on the left');
  });
});

describe('REMOTE_HOME_FIXTURE', () => {
  it('computes totals from the groups (exited and paused are not running)', () => {
    const containers = REMOTE_HOME_FIXTURE.groups.flatMap(group => group.containers);
    const running = containers.filter(container => container.status === 'running').length;

    expect(REMOTE_HOME_FIXTURE.totalContainers).toBe(containers.length);
    expect(REMOTE_HOME_FIXTURE.runningContainers).toBe(running);
    expect(REMOTE_HOME_FIXTURE.totalContainers).toBe(14);
    expect(REMOTE_HOME_FIXTURE.runningContainers).toBe(12);
  });

  it('summarizes compose groups as running/total and Others as "N · no compose"', () => {
    expect(groupSummary(groupByName('media'))).toBe('3/3');
    expect(groupSummary(groupByName('proxy'))).toBe('2/2');
    expect(groupSummary(groupByName('downloads'))).toBe('0/1');
    expect(groupSummary(groupByName('Others'))).toBe('3 · no compose');
  });
});
