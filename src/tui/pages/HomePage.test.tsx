// HomePage.test.tsx — Unit tests for HomePage composition.
// HomePage renders ActionMenu + KeyHints + VersionBar from
// groups/selectable/cursor. The Logo is owned by App.tsx (shown per
// ROUTE_TABLE[route].showLogo), so it is NOT part of HomePage.
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { HomePage } from './HomePage.js';
import type { ActionGroup, ActionItem } from '../features/menu/types.js';

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
  it('does not render the Logo (App owns it)', () => {
    // The old test asserted HomePage renders the Logo. Logo ownership moved
    // to App.tsx (conditional on ROUTE_TABLE[route].showLogo); the positive
    // "logo renders on home" coverage lives in App.test.tsx.
    const groups = [makeGroup({ id: 'local', label: 'Local', items: [makeItem({ id: 'doctor' })] })];
    const selectable = groups[0]!.items;

    const { lastFrame } = render(
      <HomePage groups={groups} selectable={selectable} cursor={0} />
    );

    // Logo contains box-drawing characters — none expected here
    expect(lastFrame()).not.toContain('███╗');
  });

  it('renders the ActionMenu', () => {
    const groups = [
      makeGroup({ id: 'local', label: 'Local', items: [makeItem({ id: 'doctor', label: 'doctor' })] }),
      makeGroup({ id: 'remote', label: 'Remote', items: [] }),
      makeGroup({ id: 'config', label: 'Config', items: [] }),
    ];
    const selectable = groups[0]!.items;

    const { lastFrame } = render(
      <HomePage groups={groups} selectable={selectable} cursor={0} />
    );

    expect(lastFrame()).toContain('doctor');
    expect(lastFrame()).toContain('Local');
    expect(lastFrame()).toContain('Remote');
    expect(lastFrame()).toContain('Config');
  });

  it('renders the KeyHints', () => {
    const groups = [makeGroup({ id: 'local', label: 'Local', items: [makeItem({ id: 'doctor' })] })];
    const selectable = groups[0]!.items;

    const { lastFrame } = render(
      <HomePage groups={groups} selectable={selectable} cursor={0} />
    );

    expect(lastFrame()).toContain('↑↓');
    expect(lastFrame()).toContain('q');
  });

  it('renders the VersionBar', () => {
    const groups = [makeGroup({ id: 'local', label: 'Local', items: [makeItem({ id: 'doctor' })] })];
    const selectable = groups[0]!.items;

    const { lastFrame } = render(
      <HomePage groups={groups} selectable={selectable} cursor={0} />
    );

    // VersionBar shows v{VERSION}
    expect(lastFrame()).toContain('v0.0.0');
  });
});
