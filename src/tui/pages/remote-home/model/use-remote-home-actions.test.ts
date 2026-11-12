// use-remote-home-actions.test.ts — Unit tests for the ACTIONS hook's stop
// path (T2-container-stop): `s` on a focused running container runs stop
// through the SAME lifecycle path as start/restart (the mocked service sees
// op 'stop'), the footer hints advertise `s stop` only where stop is
// offered, `s` is inert on an exited container (no service call), a refusal
// lands as the in-panel error, and the ACTIONS pane's Enter on the Stop row
// runs the same path. The service is mocked per the hub test style; the
// hook sits in a MemoryRouter so useNavigate is real.
import { createElement, useEffect } from 'react';

import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { containerActionsFor, selectableRows, toServiceGroups } from './remote-home.js';
import type { ContainerAction, ContainerStatus, InventoryRow } from './remote-home.js';
import { useRemoteHomeActions } from './use-remote-home-actions.js';
import type { RemoteHomeActionsModel } from './use-remote-home-actions.js';
import type { ContainerSnapshot } from '../../../../services/docker.js';
import { runContainerLifecycle } from '../../../../services/docker.js';
import { settle } from '../../../test-utils/ink-interactions.js';

vi.mock('../../../../services/docker.js', async importOriginal => {
  // Spread the REAL module so the re-exported contract types keep working;
  // only the transport-bearing function is replaced.
  const actual = await importOriginal<typeof import('../../../../services/docker.js')>();
  return { ...actual, runContainerLifecycle: vi.fn() };
});

type LifecycleOutcome = Awaited<ReturnType<typeof runContainerLifecycle>>;

const CONTAINERS: ContainerSnapshot[] = [
  { id: '1', name: 'grafana', state: 'running', composeProject: 'monitoring' },
  { id: '2', name: 'portainer', state: 'exited', composeProject: null },
];

/** The page's own derivation: the walk plus the focused row's ACTIONS list. */
function buildWalk(): InventoryRow[] {
  return selectableRows(toServiceGroups(CONTAINERS), new Set());
}

const walk = buildWalk();
const actionsFor = (status: ContainerStatus | undefined): ContainerAction[] => containerActionsFor(status);

/** Renders the hook's pane, command feedback and hints as one frame line. */
function Probe({
  cursor,
  actions,
  apiRef,
}: {
  cursor: number;
  actions: ContainerAction[];
  apiRef?: { current: RemoteHomeActionsModel | null };
}) {
  const model = useRemoteHomeActions({
    remote: 'nas',
    sessionPassword: undefined,
    actions,
    walk,
    cursor,
    isActive: true,
    refresh: () => {},
    onToggleGroup: () => {},
  });

  useEffect(() => {
    if (apiRef) apiRef.current = model;
  }, [apiRef, model]);

  const command =
    model.command === undefined
      ? 'none'
      : model.command.phase === 'running'
        ? `running:${model.command.verb}`
        : `error:${model.command.reason}`;

  const hints = model.hints.map(hint => `${hint.key} ${hint.label}`).join(' · ');

  return createElement(Text, null, `pane:${model.pane} cursor:${model.actionCursor} cmd:${command} hints:[${hints}]`);
}

const renderProbe = (cursor: number, actions: ContainerAction[]) =>
  render(createElement(MemoryRouter, null, createElement(Probe, { cursor, actions })));

/** A deferred lifecycle outcome: the running window stays observable. */
function deferLifecycle(): { promise: Promise<LifecycleOutcome>; resolve: (outcome: LifecycleOutcome) => void } {
  let resolve!: (outcome: LifecycleOutcome) => void;

  const promise = new Promise<LifecycleOutcome>(res => {
    resolve = res;
  });

  vi.mocked(runContainerLifecycle).mockReturnValue(promise);

  return { promise, resolve };
}

describe('useRemoteHomeActions — the stop path (T2-container-stop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runContainerLifecycle).mockResolvedValue({ kind: 'ok' });
  });

  it('s on a focused RUNNING container runs stop through the lifecycle service', async () => {
    const { resolve } = deferLifecycle();
    const { lastFrame, stdin, unmount } = renderProbe(0, actionsFor('running'));
    await settle(lastFrame, frame => frame.includes('pane:list'));

    stdin.write('s');

    const running = await settle(lastFrame, frame => frame.includes('cmd:running:'));
    expect(running).toContain('cmd:running:Stopp');
    expect(vi.mocked(runContainerLifecycle)).toHaveBeenCalledWith({
      remote: 'nas',
      sessionPassword: undefined,
      container: 'grafana',
      op: 'stop',
    });
    resolve({ kind: 'ok' });
    await settle(lastFrame, frame => frame.includes('cmd:none'));
    unmount();
  });

  it('the list hints advertise `s stop` only for a container that can stop', async () => {
    const running = renderProbe(0, actionsFor('running'));
    const runningFrame = await settle(running.lastFrame, frame => frame.includes('pane:list'));

    expect(runningFrame).toContain('s stop');
    running.unmount();

    const exited = renderProbe(1, actionsFor('exited'));
    const exitedFrame = await settle(exited.lastFrame, frame => frame.includes('pane:list'));

    expect(exitedFrame).not.toContain('s stop');
    expect(exitedFrame).toContain('s start');
    exited.unmount();
  });

  it('s on an EXITED container STARTS it through the lifecycle service', async () => {
    const { resolve } = deferLifecycle();
    const { lastFrame, stdin, unmount } = renderProbe(1, actionsFor('exited'));
    await settle(lastFrame, frame => frame.includes('pane:list'));

    stdin.write('s');

    const running = await settle(lastFrame, frame => frame.includes('cmd:running:'));
    expect(running).toContain('cmd:running:Start');
    expect(vi.mocked(runContainerLifecycle)).toHaveBeenCalledWith({
      remote: 'nas',
      sessionPassword: undefined,
      container: 'portainer',
      op: 'start',
    });
    resolve({ kind: 'ok' });
    await settle(lastFrame, frame => frame.includes('cmd:none'));
    unmount();
  });

  it('a stop refusal lands as the in-panel error with the reason', async () => {
    vi.mocked(runContainerLifecycle).mockResolvedValue({
      kind: 'refusal',
      reason: 'Cannot connect to the Docker daemon',
    });
    const { lastFrame, stdin, unmount } = renderProbe(0, actionsFor('running'));
    await settle(lastFrame, frame => frame.includes('pane:list'));

    stdin.write('s');

    const refused = await settle(lastFrame, frame => frame.includes('cmd:error:Cannot connect to the Docker daemon'));
    expect(refused).toContain('cmd:error:Cannot connect to the Docker daemon');
    // The `s` shortcut runs from the LIST pane: no lock was taken, so the
    // pane stays and the panel keeps showing the refusal reason.
    expect(refused).toContain('pane:list');
    unmount();
  });

  it('the ACTIONS pane Enter on the Stop row runs the same path', async () => {
    const { resolve } = deferLifecycle();
    const { lastFrame, stdin, unmount } = renderProbe(0, actionsFor('running'));
    await settle(lastFrame, frame => frame.includes('pane:list'));

    // Lock onto the container (cursor 0 = View logs), then walk to Stop (2).
    stdin.write('\r');
    await settle(lastFrame, frame => frame.includes('pane:actions'));
    stdin.write('j');
    await settle(lastFrame, frame => frame.includes('cursor:1'));
    stdin.write('j');
    await settle(lastFrame, frame => frame.includes('cursor:2'));

    stdin.write('\r');

    const running = await settle(lastFrame, frame => frame.includes('cmd:running:'));
    expect(running).toContain('cmd:running:Stopp');
    expect(vi.mocked(runContainerLifecycle)).toHaveBeenCalledWith({
      remote: 'nas',
      sessionPassword: undefined,
      container: 'grafana',
      op: 'stop',
    });
    resolve({ kind: 'ok' });
    await settle(lastFrame, frame => frame.includes('cmd:none'));
    unmount();
  });
});
