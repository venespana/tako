// RemoteHomePage.test.tsx — Unit tests for the Home/Remote hub screen
// (iteration 3 + tui-live-logs T3): the page renders the ACTIVE remote's REAL
// containers through the mocked services/docker (getContainers) — the
// English tab strip, the grouped Services list (Others last, ▼/▶ per
// effective expanded state, pen-mock expanded rows with NO cursor column
// and NO exited suffix), a cursor that walks the containers of expanded
// groups PLUS collapsed group rows (the reopen handles), space collapsing
// a focused container's group / expanding a focused collapsed group, `l`
// navigating to /logs ONLY on container rows (collapsed group rows keep the
// expand-on-select), the cursor-driven detail panel in its container and
// collapsed-group variants, the focus-driven footer hints, and the
// loading/empty/error states. Logo, active-remote header and footer are
// app-shell chrome and NOT part of this page; the page sits in a
// MemoryRouter so useNavigate is real and navigation is observable.
import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RemoteHomePage } from './RemoteHomePage.js';
import type { ContainerSnapshot } from '../../../../services/docker.js';
import { getContainers, runContainerLifecycle } from '../../../../services/docker.js';
import { usePageHintsStore } from '../../../shared/lib/page-hints-store.js';
import { usePaneLockStore } from '../../../shared/lib/pane-lock-store.js';
import { useGlobalKeys } from '../../../shared/lib/use-global-keys.js';
import { LOAD_TIMEOUT_MS, pressAndSettle, pressToggle, settle, wait } from '../../../test-utils/ink-interactions.js';

vi.mock('../../../../services/docker.js', async importOriginal => {
  // Spread the REAL module so the re-exported contract types keep working;
  // only the transport-bearing functions are replaced.
  const actual = await importOriginal<typeof import('../../../../services/docker.js')>();
  return { ...actual, getContainers: vi.fn(), runContainerLifecycle: vi.fn() };
});

// View after the model: monitoring (grafana, prometheus), proxy (caddy),
// Others (portainer, restic) — Others LAST; totals 5/3.
const CONTAINERS: ContainerSnapshot[] = [
  { id: 'prometheus-id', name: 'prometheus', state: 'running', composeProject: 'monitoring' },
  { id: 'grafana-id', name: 'grafana', state: 'exited', composeProject: 'monitoring' },
  { id: 'caddy-id', name: 'caddy', state: 'running', composeProject: 'proxy' },
  { id: 'portainer-id', name: 'portainer', state: 'running', composeProject: null },
  { id: 'restic-id', name: 'restic', state: 'paused', composeProject: null },
];

type ContainersOutcome = Awaited<ReturnType<typeof getContainers>>;
type LifecycleOutcome = Awaited<ReturnType<typeof runContainerLifecycle>>;

function stubContainers(outcome: { result?: ContainersOutcome }): void {
  vi.mocked(getContainers).mockResolvedValue(outcome.result ?? { kind: 'ok', containers: [] });
}

function stubLifecycle(outcome: LifecycleOutcome): void {
  vi.mocked(runContainerLifecycle).mockResolvedValue(outcome);
}

/** The /logs stand-in: renders the query the navigation landed with. */
function LogsMarker(): React.ReactElement {
  const [searchParams] = useSearchParams();

  return <Text>{`logs-route:${searchParams.get('container') ?? ''}`}</Text>;
}

/** The page inside a MemoryRouter, so `l`-navigation is observable; the
 * optional extra renders beside the routes (the footer spy). */
const renderHub = (extra?: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={['/remote-home']}>
      <Routes>
        <Route path='/remote-home' element={<RemoteHomePage remote='nas' sessionPassword={undefined} />} />
        <Route path='/logs' element={<LogsMarker />} />
      </Routes>
      {extra}
    </MemoryRouter>
  );

const renderPage = () => renderHub();

/** Renders the hints the page currently publishes (stands in for the footer). */
function FooterSpy(): React.ReactElement {
  const hints = usePageHintsStore(state => state.hints);

  return <Text>footer:[{hints.map(hint => `${hint.key} ${hint.label}`).join(' · ')}]</Text>;
}

const ESCAPE = '\x1b';
const RETURN = '\r';
const RIGHT = '\x1b[C';
const LEFT = '\x1b[D';

/** Footer legend while a CONTAINER row holds the cursor (list pane). */
const LIST_CONTAINER_HINTS = 'footer:[enter select · space collapse/expand · l logs]';
/** Footer legend while the ACTIONS pane holds the keyboard (locked). */
const ACTIONS_HINTS = 'footer:[arrows pick · enter run · esc back]';

/** The cursor AND the published footer hints are both out — the page's
 * passive effects (hints publication, Ink's key subscription) have flushed,
 * so key presses land on subscribed handlers instead of the documented
 * pre-subscription window (React 19 delays passive effects under load). */
const awaitHubReady = (lastFrame: ReturnType<typeof render>['lastFrame']) =>
  settle(lastFrame, f => f.includes('❯ ● grafana') && f.includes(LIST_CONTAINER_HINTS));

describe('RemoteHomePage — tab strip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
  });

  it(
    'renders the English tab strip (Services active, Global actions inert)',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame } = renderPage();
      const frame = await settle(lastFrame, f => f.includes('Services'));

      expect(frame).toContain('Services');
      expect(frame).toContain('Global actions');
      // The pen mock's Spanish label is overridden by user decision.
      expect(frame).not.toContain('Servicios');
    }
  );
});

describe('RemoteHomePage — ok state (real containers)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
  });

  it('renders the Services heading with computed totals', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('containers ·'));

    expect(frame).toContain('Services');
    expect(frame).toContain('5 containers · 3 running');
  });

  it('renders every group expanded, in order, with Others LAST', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('▼ monitoring'));

    expect(frame).toContain('▼ monitoring');
    expect(frame).toContain('▼ proxy');
    expect(frame).toContain('▼ Others');
    // Everything starts expanded — no collapsed glyphs.
    expect(frame).not.toContain('▶');

    const monitoringAt = frame.indexOf('▼ monitoring');
    const proxyAt = frame.indexOf('▼ proxy');
    const othersAt = frame.indexOf('▼ Others');

    expect(monitoringAt).toBeGreaterThanOrEqual(0);
    expect(proxyAt).toBeGreaterThan(monitoringAt);
    expect(othersAt).toBeGreaterThan(proxyAt);
  });

  it('renders all container rows with per-group summaries', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('grafana'));

    expect(frame).toContain('grafana');
    expect(frame).toContain('prometheus');
    expect(frame).toContain('caddy');
    expect(frame).toContain('portainer');
    expect(frame).toContain('restic');

    expect(frame).toContain('1/2');
    expect(frame).toContain('1/1');
    expect(frame).toContain('1 · no compose');
  });

  it(
    'pins the cursor to the FIRST container; expanded group rows never take it',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame } = renderPage();
      const frame = await settle(lastFrame, f => f.includes('❯ ● grafana'));

      expect(frame).toContain('❯ ● grafana');
      expect(frame).not.toContain('❯ ● prometheus');
      // Expanded group rows are headers — NO cursor column (pen nesting: the
      // container rows' cursor column IS the indent).
      expect(frame).not.toContain('❯ ▼');
    }
  );

  it(
    'shows the SELECTED container in the detail panel with compose context',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame } = renderPage();
      const frame = await settle(lastFrame, f => f.includes('ACTIONS'));

      expect(frame).toContain('❯ ● grafana');
      expect(frame).toContain('grafana');
      expect(frame).toContain('exited');
      expect(frame).toContain('· monitoring (compose)');

      expect(frame).toMatch(/View logs +l/);
      expect(frame).toMatch(/Start +r/);
      expect(frame).toMatch(/Stop +s/);
      expect(frame).toMatch(/Inspect +i/);
      expect(frame).toContain('❯ View logs');
      // grafana is exited, so the restart action reads Start (docker start).
      expect(frame).not.toContain('❯ Restart');
      // The 100-column test terminal wraps the note inside the detail panel,
      // so assert the wrap-stable fragments.
      expect(frame).toContain('Start when stopped, restart when');
      expect(frame).toContain('running');
      // The stale list-pane hint line was removed: pane guidance lives in the
      // footer hints (arrows pick / enter run / esc back while locked).
      expect(frame).not.toContain('↑↓ pick a container on the left');
    }
  );

  it('walks the visible containers with j/k, skipping expanded group rows', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin } = renderPage();
    await awaitHubReady(lastFrame);

    // grafana → prometheus → caddy → portainer: expanded group rows are NOT
    // in the walk. pressAndSettle: keys can drop before Ink's useInput
    // subscribes under load — the helper's single retry covers that window.
    let frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● prometheus'));
    expect(frame).toContain('❯ ● prometheus');

    frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● caddy'));
    expect(frame).toContain('❯ ● caddy');

    frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● portainer'));
    expect(frame).toContain('❯ ● portainer');
    // The detail panel now shows the standalone container's context.
    expect(frame).toContain('· no compose');
    expect(frame).not.toContain('· monitoring (compose)');
    expect(frame).not.toContain('❯ ▼');
  });
});

describe('RemoteHomePage — collapsible groups (space)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
  });

  it(
    'space on a focused container collapses its group; the collapsed row renders at column 0',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin } = renderPage();
      await awaitHubReady(lastFrame);

      const frame = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));

      expect(frame).toContain('▶ monitoring 1/2');
      // The summary comes from the real group, never a derived emptied view.
      expect(frame).not.toContain('grafana');
      expect(frame).not.toContain('prometheus');
      // Other groups are untouched.
      expect(frame).toContain('▼ proxy');
      expect(frame).toContain('caddy');
    }
  );

  it(
    "group rows never shift: the collapsed glyph sits at the expanded glyphs' indent",
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin } = renderPage();
      await awaitHubReady(lastFrame);

      const frame = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));

      // No cursor column on ANY group row, focused or not.
      expect(frame).not.toContain('❯ ▶');

      // The collapsed glyph sits at the SAME indent as the expanded glyphs'
      // (page padding + glyph) — expanding/collapsing never shifts layout.
      const collapsedLine = frame.split('\n').find(line => line.includes('▶ monitoring'));
      const expandedLine = frame.split('\n').find(line => line.includes('▼ proxy'));

      expect(collapsedLine).toBeDefined();
      expect(expandedLine).toBeDefined();
      expect(collapsedLine?.indexOf('▶')).toBe(expandedLine?.indexOf('▼'));
    }
  );

  it(
    'space again expands the focused collapsed group — the row itself is the handle',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin } = renderPage();
      await awaitHubReady(lastFrame);

      await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));
      const frame = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▼ monitoring') && f.includes('grafana'));

      expect(frame).toContain('▼ monitoring');
      expect(frame).toContain('grafana');
      expect(frame).toContain('prometheus');
      expect(frame).not.toContain('▶');
      expect(frame).toContain('❯ ● grafana');
    }
  );

  it(
    'no sticky: past the collapsed row, the next space targets the newly focused container',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin } = renderPage();
      await awaitHubReady(lastFrame);

      // j to prometheus (monitoring's SECOND container): collapsing monitoring
      // leaves the cursor at index 1 — on caddy, NOT the collapsed row.
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● prometheus'));

      const collapsed = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));

      // The cursor still lands on caddy (container rows keep their column).
      expect(collapsed).toContain('❯ ● caddy');
      expect(collapsed).toContain('▶ monitoring');
      expect(collapsed).not.toContain('❯ ▶');

      // The next space collapses CADDY'S group (proxy) — monitoring stays
      // collapsed; nothing re-expands it from a distance.
      const second = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ proxy'));

      expect(second).toContain('▶ monitoring');
      expect(second).not.toContain('▼ monitoring');
      expect(second).toContain('▶ proxy');
      expect(second).not.toContain('❯ ▶');
    }
  );

  it('l on a focused collapsed group row expands it and never navigates', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin } = renderPage();
    await awaitHubReady(lastFrame);

    await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));

    const frame = await pressToggle(stdin, lastFrame, 'l', f => f.includes('▼ monitoring') && f.includes('grafana'));

    expect(frame).toContain('▼ monitoring');
    expect(frame).toContain('grafana');
    expect(frame).not.toContain('▶');
    // The group row's `l` is the menu select (expand) — the page-level `l`
    // stayed a no-op (Ink broadcasts to both handlers).
    expect(frame).not.toContain('logs-route:');
  });

  it('l on a focused container navigates to /logs?container=<name>', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin } = renderPage();
    await awaitHubReady(lastFrame);

    const frame = await pressAndSettle(stdin, lastFrame, 'l', f => f.includes('logs-route:grafana'));

    expect(frame).toContain('logs-route:grafana');
  });

  it('l navigates with a URL-encoded container name', { timeout: LOAD_TIMEOUT_MS }, async () => {
    stubContainers({
      result: {
        kind: 'ok',
        containers: [{ id: 'odd-1', name: 'app_2.cache-1', state: 'running', composeProject: 'proxy' }],
      },
    });
    const { lastFrame, stdin } = renderPage();
    await settle(lastFrame, f => f.includes('❯ ● app_2.cache-1'));

    const frame = await pressAndSettle(stdin, lastFrame, 'l', f => f.includes('logs-route:app_2.cache-1'));

    expect(frame).toContain('logs-route:app_2.cache-1');
  });

  it(
    'shows the focused COLLAPSED group in the detail panel (summary, no ACTIONS)',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin } = renderPage();
      await awaitHubReady(lastFrame);

      const frame = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));

      expect(frame).toContain('1/2');
      expect(frame).not.toContain('ACTIONS');
      expect(frame).not.toContain('View logs');
      expect(frame).not.toContain('· monitoring (compose)');
      expect(frame).not.toContain('↑↓ pick a container');
    }
  );

  it('the walk reads: collapsed row first, then the surviving containers', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin } = renderPage();
    await awaitHubReady(lastFrame);

    await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));

    let frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● caddy'));

    expect(frame).toContain('❯ ● caddy');

    frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● portainer'));

    expect(frame).toContain('❯ ● portainer');
    expect(frame).toContain('· no compose');
  });

  it(
    'renders the yellow paused suffix for uniformly-paused groups (pen: downloads row)',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame } = renderPage();
      const frame = await settle(lastFrame, f => f.includes('▼ Others'));

      // Others = portainer running + restic paused → the approved uniform-
      // paused suffix stays.
      expect(frame).toContain('· paused');
      expect(frame).not.toContain('· exited');
    }
  );

  it(
    'never renders an exited suffix at group level, even for an all-exited group',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      stubContainers({
        result: {
          kind: 'ok',
          containers: [
            { id: 'backup-1', name: 'backup-1', state: 'exited', composeProject: 'backup' },
            { id: 'backup-2', name: 'backup-2', state: 'exited', composeProject: 'backup' },
            { id: 'caddy-id', name: 'caddy', state: 'running', composeProject: 'proxy' },
          ],
        },
      });
      const { lastFrame } = renderPage();
      const frame = await settle(lastFrame, f => f.includes('▼ backup'));

      // The all-exited group shows name + summary ONLY — no suffix.
      expect(frame).toContain('▼ backup 0/2');
      expect(frame).not.toContain('· exited');
      // The container rows and their lights still exist ('exited' as the
      // focused container's status word in the detail panel is fine).
      expect(frame).toContain('● backup-1');
      expect(frame).toContain('exited');
    }
  );

  it(
    'collapsing every group leaves only collapsed group rows, all selectable',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin } = renderPage();
      await awaitHubReady(lastFrame);

      // monitoring↓: the cursor takes the collapsed row's WALK slot (index 0).
      await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));
      // j → caddy; space → proxy↓: the walk slot moves to proxy's collapsed row.
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● caddy'));
      await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ proxy'));
      // j → portainer; space → Others↓: the walk slot moves to Others' row.
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● portainer'));
      const allCollapsed = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ Others'));

      // Only collapsed group rows remain — all at the pen column, none with a
      // cursor column; focus is marked by the detail panel (cyan in a real
      // terminal, stripped by the test renderer).
      expect(allCollapsed).toContain('▶ monitoring');
      expect(allCollapsed).toContain('▶ proxy');
      expect(allCollapsed).toContain('▶ Others');
      expect(allCollapsed).not.toContain('❯');
      expect(allCollapsed).not.toContain('▼');
      expect(allCollapsed).not.toContain('grafana');
      expect(allCollapsed).not.toContain('caddy');
      expect(allCollapsed).not.toContain('portainer');
      expect(allCollapsed).not.toContain('restic');

      // A collapsed row is the handle: space on it reopens the group.
      const reopened = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▼ Others'));

      expect(reopened).toContain('▼ Others');
      expect(reopened).toContain('❯ ● portainer');
      expect(reopened).toContain('▶ monitoring');
      expect(reopened).toContain('▶ proxy');
    }
  );
});

describe('RemoteHomePage — footer hints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
  });

  it('publishes space + logs hints while a container row is focused', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, unmount } = renderHub(<FooterSpy />);

    // Compound predicate with the FULL hint string — `footer:[` alone also
    // matches the pre-publication empty footer.
    const frame = await settle(lastFrame, f => f.includes('❯ ● grafana') && f.includes(LIST_CONTAINER_HINTS));

    expect(frame).toContain(LIST_CONTAINER_HINTS);
    unmount();
  });

  it(
    'switches hints with the focused row kind: container → collapsed group → container',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
      await settle(lastFrame, f => f.includes(LIST_CONTAINER_HINTS));

      // Collapsing the focused container's group leaves the cursor on the
      // collapsed group row → space only.
      await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));
      const groupHints = await settle(lastFrame, f => f.includes('footer:[space collapse/expand]'));
      expect(groupHints).toContain('footer:[space collapse/expand]');
      expect(groupHints).not.toContain('l logs');

      // Reopening returns the cursor to the container → the logs hint is back.
      await pressToggle(stdin, lastFrame, ' ', f => f.includes('▼ monitoring') && f.includes('grafana'));
      const restored = await settle(lastFrame, f => f.includes(LIST_CONTAINER_HINTS));
      expect(restored).toContain(LIST_CONTAINER_HINTS);
      unmount();
    }
  );

  it('publishes no hints while loading', { timeout: LOAD_TIMEOUT_MS }, async () => {
    vi.mocked(getContainers).mockImplementation(() => new Promise<ContainersOutcome>(() => undefined));
    const { lastFrame, unmount } = renderHub(<FooterSpy />);

    const frame = await settle(lastFrame, f => f.includes('Connecting to nas…'));

    expect(frame).toContain('footer:[]');
    unmount();
  });
});

describe('RemoteHomePage — states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
  });

  it('renders the loading state while the fetch is in flight', { timeout: LOAD_TIMEOUT_MS }, async () => {
    let resolveFetch!: (outcome: ContainersOutcome) => void;
    vi.mocked(getContainers).mockImplementation(
      () =>
        new Promise<ContainersOutcome>(resolve => {
          resolveFetch = resolve;
        })
    );
    const { lastFrame, unmount } = renderPage();

    const loading = await settle(lastFrame, f => f.includes('Connecting to nas…'));
    expect(loading).toContain('Connecting to nas…');
    expect(loading).toContain('Fetching containers…');
    expect(loading).not.toContain('grafana');

    resolveFetch({ kind: 'ok', containers: CONTAINERS });
    await awaitHubReady(lastFrame);
    unmount();
  });

  it('renders the empty state when the remote runs no containers', { timeout: LOAD_TIMEOUT_MS }, async () => {
    stubContainers({ result: { kind: 'ok', containers: [] } });
    const { lastFrame } = renderPage();

    const empty = await settle(lastFrame, f => f.includes('no containers found'));
    expect(empty).toContain('no containers found on nas.');
  });

  it('renders the error state with the refusal reason verbatim', { timeout: LOAD_TIMEOUT_MS }, async () => {
    stubContainers({ result: { kind: 'refusal', reason: 'docker ps line 1 is not valid JSON' } });
    const { lastFrame } = renderPage();

    const error = await settle(lastFrame, f => f.includes('Unable to fetch containers'));
    expect(error).toContain('✖ Unable to fetch containers');
    expect(error).toContain('docker ps line 1 is not valid JSON');
    expect(error).toContain('Check that the host is reachable.');
  });
});

describe('RemoteHomePage — container selection lock (iteration 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
  });

  it('Enter on a focused container locks navigation into the ACTIONS pane', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
    await awaitHubReady(lastFrame);

    const locked = await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));

    expect(locked).toContain(ACTIONS_HINTS);
    // The list cursor stays frozen on the locked container.
    expect(locked).toContain('❯ ● grafana');
    expect(locked).not.toContain('enter select');
    unmount();
  });

  it('ArrowRight locks the same way as Enter', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
    await awaitHubReady(lastFrame);

    const locked = await pressToggle(stdin, lastFrame, RIGHT, f => f.includes(ACTIONS_HINTS));

    expect(locked).toContain(ACTIONS_HINTS);
    expect(locked).toContain('❯ ● grafana');
    unmount();
  });

  it('↑↓ while locked move the ACTIONS cursor, not the list cursor', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
    await awaitHubReady(lastFrame);
    await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));

    // grafana is exited, so its second action reads Start.
    const moved = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Start'));

    expect(moved).toContain('❯ Start');
    expect(moved).not.toContain('❯ View logs');
    // The list cursor froze on grafana.
    expect(moved).toContain('❯ ● grafana');
    expect(moved).not.toContain('❯ ● prometheus');
    unmount();
  });

  it('the action cursor wraps at both ends of the ACTIONS list', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
    await awaitHubReady(lastFrame);
    await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));

    // Up from the first action wraps to the last one.
    const wrapped = await pressAndSettle(stdin, lastFrame, 'k', f => f.includes('❯ Inspect'));
    expect(wrapped).toContain('❯ Inspect');

    // Down from the last action wraps back to the first.
    const back = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ View logs'));
    expect(back).toContain('❯ View logs');
    unmount();
  });

  it(
    'ArrowLeft unlocks back to the list pane (the list keyboard works again)',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
      await awaitHubReady(lastFrame);
      await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));

      const unlocked = await pressToggle(stdin, lastFrame, LEFT, f => f.includes(LIST_CONTAINER_HINTS));

      expect(unlocked).toContain(LIST_CONTAINER_HINTS);

      const moved = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● prometheus'));

      expect(moved).toContain('❯ ● prometheus');
      unmount();
    }
  );

  it('Escape unlocks too', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
    await awaitHubReady(lastFrame);
    await pressToggle(stdin, lastFrame, RIGHT, f => f.includes(ACTIONS_HINTS));

    const unlocked = await pressToggle(stdin, lastFrame, ESCAPE, f => f.includes(LIST_CONTAINER_HINTS));

    expect(unlocked).toContain(LIST_CONTAINER_HINTS);
    expect(unlocked).not.toContain(ACTIONS_HINTS);
    unmount();
  });

  it(
    'ArrowRight on a focused collapsed group row expands it and never locks',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
      await awaitHubReady(lastFrame);
      await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));

      const expanded = await pressToggle(
        stdin,
        lastFrame,
        RIGHT,
        f => f.includes('▼ monitoring') && f.includes('grafana')
      );

      expect(expanded).toContain('▼ monitoring');
      expect(expanded).not.toContain(ACTIONS_HINTS);
      expect(expanded).toContain(LIST_CONTAINER_HINTS);
      unmount();
    }
  );

  it(
    'while locked the list keys are dead: space collapses nothing, l navigates nowhere',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
      await awaitHubReady(lastFrame);
      await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));

      // Sanity: keys ARE processed while locked (the action cursor moves).
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Start'));

      stdin.write(' ');
      await wait(120);

      const afterSpace = lastFrame() ?? '';

      expect(afterSpace).not.toContain('▶ monitoring');
      expect(afterSpace).toContain('▼ monitoring');

      stdin.write('l');
      await wait(120);

      expect(lastFrame() ?? '').not.toContain('logs-route:');
      unmount();
    }
  );
});

describe('RemoteHomePage — action execution (iteration 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
    stubLifecycle({ kind: 'ok' });
  });

  it('Enter on View logs navigates to the container logs route', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
    await awaitHubReady(lastFrame);
    await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));

    const frame = await pressAndSettle(stdin, lastFrame, RETURN, f => f.includes('logs-route:grafana'));

    expect(frame).toContain('logs-route:grafana');
    unmount();
  });

  it(
    'Start on an exited container sends the start op, shows the running line, then refreshes',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      let resolveLifecycle!: (outcome: LifecycleOutcome) => void;
      vi.mocked(runContainerLifecycle).mockImplementation(
        () =>
          new Promise<LifecycleOutcome>(resolve => {
            resolveLifecycle = resolve;
          })
      );
      const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
      await awaitHubReady(lastFrame);
      await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Start'));

      await pressAndSettle(stdin, lastFrame, RETURN, f => f.includes('Starting…'));

      const frame = lastFrame() ?? '';

      expect(frame).toContain('Starting…');
      expect(vi.mocked(runContainerLifecycle)).toHaveBeenCalledWith({
        remote: 'nas',
        sessionPassword: undefined,
        container: 'grafana',
        op: 'start',
      });

      // Success: the list refreshes (a second fetch) and the pane returns to
      // the list — the loading phase deactivated the keys in between.
      resolveLifecycle({ kind: 'ok' });
      const refreshed = await settle(lastFrame, f => f.includes(LIST_CONTAINER_HINTS));

      expect(refreshed).toContain('❯ ● grafana');
      expect(refreshed).not.toContain('Starting…');
      expect(vi.mocked(getContainers)).toHaveBeenCalledTimes(2);
      unmount();
    }
  );

  it(
    'Restart on a running container sends the restart op and shows Restarting…',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      let resolveLifecycle!: (outcome: LifecycleOutcome) => void;
      vi.mocked(runContainerLifecycle).mockImplementation(
        () =>
          new Promise<LifecycleOutcome>(resolve => {
            resolveLifecycle = resolve;
          })
      );
      const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
      await awaitHubReady(lastFrame);
      // Walk to prometheus (running) in the LIST pane, then lock.
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● prometheus'));
      await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Restart'));

      await pressAndSettle(stdin, lastFrame, RETURN, f => f.includes('Restarting…'));

      expect(vi.mocked(runContainerLifecycle)).toHaveBeenCalledWith({
        remote: 'nas',
        sessionPassword: undefined,
        container: 'prometheus',
        op: 'restart',
      });
      resolveLifecycle({ kind: 'ok' });
      await settle(lastFrame, f => f.includes(LIST_CONTAINER_HINTS));
      unmount();
    }
  );

  it('a refusal keeps the lock and shows the reason in the panel', { timeout: LOAD_TIMEOUT_MS }, async () => {
    stubLifecycle({ kind: 'refusal', reason: 'Cannot connect to the Docker daemon' });
    const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
    await awaitHubReady(lastFrame);
    await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));
    await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Start'));

    const refused = await pressAndSettle(stdin, lastFrame, RETURN, f =>
      f.includes('Cannot connect to the Docker daemon')
    );

    expect(refused).toContain('Cannot connect to the Docker daemon');
    // The lock is kept: the action keyboard still owns the footer.
    expect(refused).toContain(ACTIONS_HINTS);
    expect(refused).not.toContain('❯ ● prometheus');
    unmount();
  });

  it('a running command ignores re-entry (Enter is dead until it settles)', { timeout: LOAD_TIMEOUT_MS }, async () => {
    let resolveLifecycle!: (outcome: LifecycleOutcome) => void;
    vi.mocked(runContainerLifecycle).mockImplementation(
      () =>
        new Promise<LifecycleOutcome>(resolve => {
          resolveLifecycle = resolve;
        })
    );
    const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
    await awaitHubReady(lastFrame);
    await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));
    await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Start'));

    await pressAndSettle(stdin, lastFrame, RETURN, f => f.includes('Starting…'));

    stdin.write(RETURN);
    await wait(120);

    expect(vi.mocked(runContainerLifecycle)).toHaveBeenCalledTimes(1);
    resolveLifecycle({ kind: 'ok' });
    await settle(lastFrame, f => f.includes(LIST_CONTAINER_HINTS));
    unmount();
  });

  it(
    'stop and inspect stay visible but inert: no service call, no navigation',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
      await awaitHubReady(lastFrame);
      await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));

      // j → Start, j → Stop.
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Start'));
      const onStop = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Stop'));

      expect(onStop).toContain('❯ Stop');

      stdin.write(RETURN);
      await wait(120);

      const afterStop = lastFrame() ?? '';

      expect(vi.mocked(runContainerLifecycle)).not.toHaveBeenCalled();
      expect(afterStop).not.toContain('logs-route:');

      const onInspect = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Inspect'));

      expect(onInspect).toContain('❯ Inspect');

      stdin.write(RETURN);
      await wait(120);

      expect(vi.mocked(runContainerLifecycle)).not.toHaveBeenCalled();
      expect(lastFrame() ?? '').not.toContain('logs-route:');
      unmount();
    }
  );

  it(
    'an unknown-remote outcome lands in the panel as a kept-lock error too',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      stubLifecycle({ kind: 'unknown-remote', reason: 'unknown remote "nas"' });
      const { lastFrame, stdin, unmount } = renderHub(<FooterSpy />);
      await awaitHubReady(lastFrame);
      await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ Start'));

      const refused = await pressAndSettle(stdin, lastFrame, RETURN, f => f.includes('unknown remote "nas"'));

      expect(refused).toContain('unknown remote "nas"');
      expect(refused).toContain(ACTIONS_HINTS);
      unmount();
    }
  );
});

describe('RemoteHomePage — pane lock vs global back (iteration 3 correction)', () => {
  /** Production parity: AppShell mounts useGlobalKeys around every page —
   * without it the global back (Esc/h/⌫) these tests reason about does not
   * exist. */
  function GlobalKeysProbe(): React.ReactElement {
    useGlobalKeys();

    return <></>;
  }

  /** The hub with a two-entry history: while locked, Esc/h must NOT take
   * the global back path; after unlocking they must. The `/elsewhere` entry
   * makes navigate(-1) observable. */
  const renderHubWithBackHistory = () =>
    render(
      <MemoryRouter initialEntries={['/elsewhere', '/remote-home']}>
        <Routes>
          <Route path='/remote-home' element={<RemoteHomePage remote='nas' sessionPassword={undefined} />} />
          <Route path='/logs' element={<LogsMarker />} />
          <Route path='/elsewhere' element={<Text>elsewhere-route</Text>} />
        </Routes>
        <GlobalKeysProbe />
        <FooterSpy />
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
    usePaneLockStore.setState({ locked: false });
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
  });

  it('Esc while locked unlocks the pane and stays on the services screen', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin, unmount } = renderHubWithBackHistory();
    await awaitHubReady(lastFrame);
    await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));

    expect(usePaneLockStore.getState().locked).toBe(true);

    const unlocked = await pressToggle(stdin, lastFrame, ESCAPE, f => f.includes(LIST_CONTAINER_HINTS));

    expect(unlocked).toContain(LIST_CONTAINER_HINTS);
    // The reported bug: the unlock must NOT fire the global back — the user
    // stays on /remote-home.
    expect(unlocked).toContain('Services');
    expect(unlocked).not.toContain('elsewhere-route');
    expect(usePaneLockStore.getState().locked).toBe(false);
    unmount();
  });

  it(
    'h while locked unlocks too (vim-left parity), and the NEXT h goes back globally',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin, unmount } = renderHubWithBackHistory();
      await awaitHubReady(lastFrame);
      await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));

      const unlocked = await pressToggle(stdin, lastFrame, 'h', f => f.includes(LIST_CONTAINER_HINTS));

      expect(unlocked).toContain(LIST_CONTAINER_HINTS);
      expect(unlocked).not.toContain('elsewhere-route');

      const back = await pressAndSettle(stdin, lastFrame, 'h', f => f.includes('elsewhere-route'));

      expect(back).toContain('elsewhere-route');
      unmount();
    }
  );

  it('after unlocking, Esc returns to the global back semantics', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, stdin, unmount } = renderHubWithBackHistory();
    await awaitHubReady(lastFrame);
    await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));
    await pressToggle(stdin, lastFrame, ESCAPE, f => f.includes(LIST_CONTAINER_HINTS));

    const back = await pressAndSettle(stdin, lastFrame, ESCAPE, f => f.includes('elsewhere-route'));

    expect(back).toContain('elsewhere-route');
    unmount();
  });

  it(
    'leaving the screen while locked clears the lock (view-logs navigation)',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, stdin, unmount } = renderHubWithBackHistory();
      await awaitHubReady(lastFrame);
      await pressToggle(stdin, lastFrame, RETURN, f => f.includes(ACTIONS_HINTS));

      expect(usePaneLockStore.getState().locked).toBe(true);

      await pressAndSettle(stdin, lastFrame, RETURN, f => f.includes('logs-route:grafana'));

      // The route change unmounted the page: its cleanup must release the
      // global back suppression for whatever screen comes next. React 19
      // flushes passive-effect cleanups after paint, so poll instead of
      // asserting on the first logs frame.
      await vi.waitFor(() => expect(usePaneLockStore.getState().locked).toBe(false));
      unmount();
    }
  );
});
