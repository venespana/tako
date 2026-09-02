// use-menu-navigation.test.tsx — Unit tests for the select-to-navigate
// handler: the navigate branch, the same-path dedupe no-op, and the
// undefined-route guard. The probe wires useMenuList + useMenuNavigation
// exactly like a menu page and renders pathname + location key: the key
// changes on every navigation (even to the same path), so a no-op select
// leaves the frame byte-identical while a real navigation does not.
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

import { pressAndSettle, settle, wait } from '../../../test-utils/ink-interactions.js';
import { useMenuList } from './use-menu-list.js';
import { useMenuNavigation } from './use-menu-navigation.js';
import type { ActionItem } from './menu-items.js';

const routedItem = (id: string, route?: string): ActionItem => ({ id, label: id, command: id, kind: 'action', route });

function NavProbe({ selectable }: { selectable: ActionItem[] }): React.ReactElement {
  const handleSelect = useMenuNavigation();
  const location = useLocation();
  useMenuList({ selectable, onSelect: handleSelect });
  return (
    <Text>
      path={location.pathname} loc={location.key}
    </Text>
  );
}

const renderNav = (initialPath: string, selectable: ActionItem[]) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path='*' element={<NavProbe selectable={selectable} />} />
      </Routes>
    </MemoryRouter>
  );

describe('useMenuNavigation', () => {
  it("navigates to the focused item's route on select", async () => {
    const { stdin, lastFrame, unmount } = renderNav('/doctor', [routedItem('logs', '/logs')]);
    await settle(lastFrame, f => f.includes('path=/doctor'), 1000);

    const frame = await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('path=/logs'));
    expect(frame).toContain('path=/logs');
    unmount();
  });

  it('dedupes selection of the current path (no navigation)', async () => {
    const { stdin, lastFrame, unmount } = renderNav('/doctor', [routedItem('doctor', '/doctor')]);
    const before = await settle(lastFrame, f => f.includes('path=/doctor'), 1000);

    stdin.write('\r');
    await wait(80);
    expect(lastFrame()).toBe(before);
    unmount();
  });

  it('ignores items without a route', async () => {
    const { stdin, lastFrame, unmount } = renderNav('/doctor', [routedItem('noop')]);
    const before = await settle(lastFrame, f => f.includes('path=/doctor'), 1000);

    stdin.write('\r');
    await wait(80);
    expect(lastFrame()).toBe(before);
    unmount();
  });
});
