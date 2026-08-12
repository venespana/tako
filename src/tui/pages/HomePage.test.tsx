// HomePage.test.tsx — Unit tests for HomePage composition.
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import type { ReactElement } from 'react';
import { HomePage } from './HomePage.js';
import type { ActionGroup, ActionItem, ViewState } from '../features/menu/types.js';

const makeItem = (overrides: Partial<ActionItem> = {}): ActionItem => ({
  id: 'test',
  label: 'test',
  command: 'test',
  kind: 'action',
  ...overrides,
});

const makeGroup = (overrides: Partial<ActionGroup> & { items?: ActionItem[] } = {}): ActionGroup => ({
  id: 'group1',
  label: 'Group',
  items: [],
  ...overrides,
});

describe('HomePage', () => {
  it('renders the Logo', () => {
    const groups = [makeGroup({ id: 'local', label: 'Local', items: [makeItem({ id: 'doctor' })] })];
    const selectable = groups[0]!.items;
    const view: ViewState = { view: 'list' };

    const { lastFrame } = render(
      <HomePage groups={groups} selectable={selectable} cursor={0} view={view} />
    );

    // Logo contains box-drawing characters
    expect(lastFrame()).toContain('███╗');
  });

  it('renders the ActionMenu', () => {
    const groups = [
      makeGroup({ id: 'local', label: 'Local', items: [makeItem({ id: 'doctor', label: 'doctor' })] }),
      makeGroup({ id: 'remote', label: 'Remote', items: [] }),
      makeGroup({ id: 'config', label: 'Config', items: [] }),
    ];
    const selectable = groups[0]!.items;
    const view: ViewState = { view: 'list' };

    const { lastFrame } = render(
      <HomePage groups={groups} selectable={selectable} cursor={0} view={view} />
    );

    expect(lastFrame()).toContain('doctor');
    expect(lastFrame()).toContain('Local');
    expect(lastFrame()).toContain('Remote');
    expect(lastFrame()).toContain('Config');
  });

  it('renders the KeyHints', () => {
    const groups = [makeGroup({ id: 'local', label: 'Local', items: [makeItem({ id: 'doctor' })] })];
    const selectable = groups[0]!.items;
    const view: ViewState = { view: 'list' };

    const { lastFrame } = render(
      <HomePage groups={groups} selectable={selectable} cursor={0} view={view} />
    );

    expect(lastFrame()).toContain('↑↓');
    expect(lastFrame()).toContain('q');
  });

  it('renders the VersionBar', () => {
    const groups = [makeGroup({ id: 'local', label: 'Local', items: [makeItem({ id: 'doctor' })] })];
    const selectable = groups[0]!.items;
    const view: ViewState = { view: 'list' };

    const { lastFrame } = render(
      <HomePage groups={groups} selectable={selectable} cursor={0} view={view} />
    );

    // VersionBar shows v{VERSION}
    expect(lastFrame()).toContain('v0.0.0');
  });
});
