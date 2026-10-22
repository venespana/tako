// AppShell.test.tsx — 9.14a: the active remote rides BELOW the logo, stacked,
// with the handshake's agent version once known. 9.15a: the footer is the
// ONLY key-hint surface — a page's published hints render before back/quit.
// 9.20: hints publish into the zustand module-scope store — tests reset the
// singleton instead of wrapping a provider.

import { render } from 'ink-testing-library';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppShell } from './AppShell.js';
import { usePageHints, usePageHintsStore, type KeyHint } from '../../../shared/lib/page-hints-store.js';

const PAGE_HINTS: readonly KeyHint[] = [
  { key: 'n', label: 'new' },
  { key: 'r', label: 'dry-run' },
  { key: 'a', label: 'apply' },
  { key: 'e', label: 'edit' },
  { key: 'd', label: 'delete' },
];

/** Module-level stand-in for a page that declares its footer hints. */
function HintPublisher(): null {
  usePageHints(PAGE_HINTS);
  return null;
}

function renderShell(props: { activeRemote?: string; agentVersion?: string }) {
  const router = createMemoryRouter([{ path: '/', element: <AppShell {...props} /> }], {
    initialEntries: ['/'],
  });
  return render(<RouterProvider router={router} />);
}

/** Shell + an index route that publishes hints (the composed app's shape). */
function renderShellWithHints(props: { activeRemote?: string; agentVersion?: string }) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell {...props} />,
        children: [{ index: true, element: <HintPublisher /> }],
      },
    ],
    { initialEntries: ['/'] }
  );
  return render(<RouterProvider router={router} />);
}

describe('AppShell header (9.14a)', () => {
  it('shows `remote · agent <version> (active)` below the logo when a version is known', () => {
    const { lastFrame } = renderShell({ activeRemote: 'homeserver', agentVersion: '0.2.0' });
    expect(lastFrame() ?? '').toContain('homeserver · agent 0.2.0 (active)');
  });

  it('shows just the remote name until the handshake reports a version', () => {
    const { lastFrame } = renderShell({ activeRemote: 'homeserver' });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('homeserver');
    expect(frame).not.toContain('(active)');
  });

  it('shows no remote line without an active remote', () => {
    const { lastFrame } = renderShell({});
    expect(lastFrame() ?? '').not.toContain('(active)');
  });
});

describe('AppShell footer key hints (9.15a)', () => {
  beforeEach(() => {
    usePageHintsStore.setState({ hints: [], formMode: false });
  });

  it('renders the active page hints in declared order with back/quit last', async () => {
    const { lastFrame } = renderShellWithHints({});
    // The page publishes its hints from an effect — one tick after mount.
    await new Promise(resolve => setTimeout(resolve, 50));
    const frame = lastFrame() ?? '';
    const positions = ['new', 'dry-run', 'apply', 'edit', 'delete', 'back', 'quit'].map(label => {
      const at = frame.indexOf(label);
      expect(at).toBeGreaterThanOrEqual(0);
      return at;
    });

    positions.slice(1).forEach((at, index) => {
      expect(at).toBeGreaterThan(positions[index]!);
    });
  });
});
