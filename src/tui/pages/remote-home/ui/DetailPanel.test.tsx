// DetailPanel.test.tsx — Unit tests for the RIGHT column's two modes: the
// container panel (name, lit status, compose context, ACTIONS list) and the
// group panel (bold name + dim summary, no status row, no ACTIONS) shown
// while a COLLAPSED group row holds the cursor.
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { DetailPanel } from './DetailPanel.js';
import { toRemoteHomeView } from '../model/remote-home.js';
import type { ContainerAction, ContainerEntry } from '../model/remote-home.js';

const ACTIONS: ContainerAction[] = [
  { id: 'view-logs', label: 'View logs', key: 'l' },
  { id: 'restart', label: 'Restart', key: 'r' },
];

const CONTAINER: ContainerEntry = { id: 'caddy-id', name: 'caddy', status: 'running' };

describe('DetailPanel — container mode', () => {
  it('renders the focused container with lit status, context and the action list', () => {
    const { lastFrame } = render(
      <DetailPanel actions={ACTIONS} composeProject='proxy' container={CONTAINER} focusedActionId='view-logs' />
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('caddy');
    expect(frame).toContain('running');
    expect(frame).toContain('· proxy (compose)');
    expect(frame).toContain('ACTIONS');
    expect(frame).toMatch(/View logs +l/);
    expect(frame).toContain('❯ View logs');
    expect(frame).not.toContain('❯ Restart');
  });
});

describe('DetailPanel — group mode (collapsed group row focused)', () => {
  it('renders a focused GROUP as name plus summary, without status row or ACTIONS', () => {
    const view = toRemoteHomeView([
      { id: '1', name: 'grafana', state: 'exited', composeProject: 'monitoring' },
      { id: '2', name: 'prometheus', state: 'running', composeProject: 'monitoring' },
    ]);
    const group = view.groups[0]!;

    const { lastFrame } = render(<DetailPanel actions={ACTIONS} focusedActionId='view-logs' group={group} />);

    const frame = lastFrame() ?? '';

    expect(frame).toContain('monitoring');
    expect(frame).toContain('1/2');
    // No status light, no action list, and no container content leaks in.
    expect(frame).not.toContain('●');
    expect(frame).not.toContain('ACTIONS');
    expect(frame).not.toContain('View logs');
    expect(frame).not.toContain('grafana');
  });
});
