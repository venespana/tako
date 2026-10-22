// RemoteHomePage.test.tsx — Unit tests for the Home/Remote hub screen
// (iteration 3, final contract): the page renders the ACTIVE remote's REAL
// containers through the mocked services/docker (getContainers) — the
// English tab strip, the grouped Services list (Others last, ▼/▶ per
// effective expanded state, pen-mock expanded rows with NO cursor column
// and NO exited suffix), a cursor that walks the containers of expanded
// groups PLUS collapsed group rows (the reopen handles), space collapsing
// a focused container's group / expanding a focused collapsed group, the
// cursor-driven detail panel in its container and collapsed-group variants,
// the published footer hints, and the loading/empty/error states. Logo,
// active-remote header and footer are app-shell chrome and NOT part of this
// page; the page uses no router this iteration.
import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RemoteHomePage } from './RemoteHomePage.js';
import type { ContainerSnapshot } from '../../../../services/docker.js';
import { getContainers } from '../../../../services/docker.js';
import { usePageHintsStore } from '../../../shared/lib/page-hints-store.js';
import { KEY_FLUSH_MS, pressAndSettle, settle, wait } from '../../../test-utils/ink-interactions.js';

vi.mock('../../../../services/docker.js', async importOriginal => {
  // Spread the REAL module so the re-exported contract types keep working;
  // only the transport-bearing function is replaced.
  const actual = await importOriginal<typeof import('../../../../services/docker.js')>();
  return { ...actual, getContainers: vi.fn() };
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

function stubContainers(outcome: { result?: ContainersOutcome }): void {
  vi.mocked(getContainers).mockResolvedValue(outcome.result ?? { kind: 'ok', containers: [] });
}

const renderPage = () => render(<RemoteHomePage remote='nas' sessionPassword={undefined} />);

/** Toggle-safe key press: a landed space/l-toggle ALWAYS changes the frame
 * (glyph flip or cursor move), so wait for any change as proof of
 * processing and settle on the expected state without writing again —
 * while a frame that never changed proves the key was dropped, making a
 * retry safe. Raw single writes and blind retries (pressAndSettle) are
 * both wrong for toggles: the former flakes on drops, the latter undoes a
 * landed press. */
async function pressToggle(
  stdin: ReturnType<typeof render>['stdin'],
  lastFrame: ReturnType<typeof render>['lastFrame'],
  key: string,
  expectFrame: (frame: string) => boolean
): Promise<string> {
  /** Polls until the frame moves off `before` (processed key) or the
   * flush window elapses (dropped key). */
  const waitChange = async (before: string, tries: number): Promise<string> => {
    if (tries === 0) return lastFrame() ?? '';

    await wait(10);

    const current = lastFrame() ?? '';

    return current === before ? waitChange(before, tries - 1) : current;
  };

  const attempt = async (round: number): Promise<string> => {
    const before = lastFrame() ?? '';

    if (expectFrame(before)) return before;

    stdin.write(key);

    const current = await waitChange(before, KEY_FLUSH_MS / 10);

    // Processed — settle on the expected state; another write would undo
    // the toggle. Unchanged after the window means dropped: safe to retry.
    if (current !== before) return settle(lastFrame, expectFrame, KEY_FLUSH_MS);

    return round < 2 ? attempt(round + 1) : settle(lastFrame, expectFrame, KEY_FLUSH_MS);
  };

  return attempt(0);
}

/** Renders the hints the page currently publishes (stands in for the footer). */
function FooterSpy(): React.ReactElement {
  const hints = usePageHintsStore(state => state.hints);

  return <Text>footer:[{hints.map(hint => `${hint.key} ${hint.label}`).join(' · ')}]</Text>;
}

describe('RemoteHomePage — tab strip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
  });

  it('renders the English tab strip (Services active, Global actions inert)', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('Services'), 1000);

    expect(frame).toContain('Services');
    expect(frame).toContain('Global actions');
    // The pen mock's Spanish label is overridden by user decision.
    expect(frame).not.toContain('Servicios');
  });
});

describe('RemoteHomePage — ok state (real containers)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
  });

  it('renders the Services heading with computed totals', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('containers ·'), 1000);

    expect(frame).toContain('Services');
    expect(frame).toContain('5 containers · 3 running');
  });

  it('renders every group expanded, in order, with Others LAST', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('▼ monitoring'), 1000);

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

  it('renders all container rows with per-group summaries', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('grafana'), 1000);

    expect(frame).toContain('grafana');
    expect(frame).toContain('prometheus');
    expect(frame).toContain('caddy');
    expect(frame).toContain('portainer');
    expect(frame).toContain('restic');

    expect(frame).toContain('1/2');
    expect(frame).toContain('1/1');
    expect(frame).toContain('1 · no compose');
  });

  it('pins the cursor to the FIRST container; expanded group rows never take it', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);

    expect(frame).toContain('❯ ● grafana');
    expect(frame).not.toContain('❯ ● prometheus');
    // Expanded group rows are headers — NO cursor column (pen nesting: the
    // container rows' cursor column IS the indent).
    expect(frame).not.toContain('❯ ▼');
  });

  it('shows the SELECTED container in the detail panel with compose context', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('ACTIONS'), 1000);

    expect(frame).toContain('❯ ● grafana');
    expect(frame).toContain('grafana');
    expect(frame).toContain('exited');
    expect(frame).toContain('· monitoring (compose)');

    expect(frame).toMatch(/View logs +l/);
    expect(frame).toMatch(/Restart +r/);
    expect(frame).toMatch(/Stop +s/);
    expect(frame).toMatch(/Inspect +i/);
    expect(frame).toContain('❯ View logs');
    expect(frame).not.toContain('❯ Restart');
    // The 100-column test terminal wraps the note inside the detail panel,
    // so assert the wrap-stable fragments; 'stopped' is unique.
    expect(frame).toContain('Start is available when the container is');
    expect(frame).toContain('stopped');
    expect(frame).toContain('↑↓ pick a container on the left');
  });

  it('walks the visible containers with j/k, skipping expanded group rows', async () => {
    const { lastFrame, stdin } = renderPage();
    await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);

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

  it('space on a focused container collapses its group; the collapsed row takes the cursor', async () => {
    const { lastFrame, stdin } = renderPage();
    await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);

    const frame = await pressToggle(stdin, lastFrame, ' ', f => f.includes('❯ ▶ monitoring'));

    expect(frame).toContain('❯ ▶ monitoring 1/2');
    // The summary comes from the real group, never a derived emptied view.
    expect(frame).not.toContain('grafana');
    expect(frame).not.toContain('prometheus');
    // Other groups are untouched.
    expect(frame).toContain('▼ proxy');
    expect(frame).toContain('caddy');
  });

  it('space again expands the focused collapsed group — the row itself is the handle', async () => {
    const { lastFrame, stdin } = renderPage();
    await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);

    await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ monitoring'));
    const frame = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▼ monitoring') && f.includes('grafana'));

    expect(frame).toContain('▼ monitoring');
    expect(frame).toContain('grafana');
    expect(frame).toContain('prometheus');
    expect(frame).not.toContain('▶');
    expect(frame).toContain('❯ ● grafana');
  });

  it('no sticky: past the collapsed row, the next space targets the newly focused container', async () => {
    const { lastFrame, stdin } = renderPage();
    await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);

    // j to prometheus (monitoring's SECOND container): collapsing monitoring
    // leaves the cursor at index 1 — on caddy, NOT the collapsed row.
    await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● prometheus'));

    const collapsed = await pressToggle(stdin, lastFrame, ' ', f => f.includes('  ▶ monitoring'));

    expect(collapsed).toContain('❯ ● caddy');
    expect(collapsed).toContain('▶ monitoring');
    expect(collapsed).not.toContain('❯ ▶ monitoring');

    // The next space collapses CADDY'S group (proxy) — monitoring stays
    // collapsed; nothing re-expands it from a distance.
    const second = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▶ proxy'));

    expect(second).toContain('▶ monitoring');
    expect(second).not.toContain('▼ monitoring');
    expect(second).toContain('❯ ▶ proxy');
  });

  it('l on a focused collapsed group row expands it', async () => {
    const { lastFrame, stdin } = renderPage();
    await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);

    await pressToggle(stdin, lastFrame, ' ', f => f.includes('❯ ▶ monitoring'));

    const frame = await pressToggle(stdin, lastFrame, 'l', f => f.includes('▼ monitoring') && f.includes('grafana'));

    expect(frame).toContain('▼ monitoring');
    expect(frame).toContain('grafana');
    expect(frame).not.toContain('▶');
  });

  it('l on a focused container stays a no-op select', async () => {
    const { lastFrame, stdin } = renderPage();
    await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);

    const frame = await pressAndSettle(stdin, lastFrame, 'l', f => f.includes('❯ ● grafana'));

    expect(frame).toContain('▼ monitoring');
    expect(frame).toContain('grafana');
    expect(frame).toContain('ACTIONS');
  });

  it('shows the focused COLLAPSED group in the detail panel (summary, no ACTIONS)', async () => {
    const { lastFrame, stdin } = renderPage();
    await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);

    const frame = await pressToggle(stdin, lastFrame, ' ', f => f.includes('❯ ▶ monitoring'));

    expect(frame).toContain('1/2');
    expect(frame).not.toContain('ACTIONS');
    expect(frame).not.toContain('View logs');
    expect(frame).not.toContain('· monitoring (compose)');
    expect(frame).not.toContain('↑↓ pick a container');
  });

  it('the walk reads: collapsed row first, then the surviving containers', async () => {
    const { lastFrame, stdin } = renderPage();
    await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);

    await pressToggle(stdin, lastFrame, ' ', f => f.includes('❯ ▶ monitoring'));

    let frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● caddy'));

    expect(frame).toContain('❯ ● caddy');

    frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● portainer'));

    expect(frame).toContain('❯ ● portainer');
    expect(frame).toContain('· no compose');
  });

  it('renders the yellow paused suffix for uniformly-paused groups (pen: downloads row)', async () => {
    const { lastFrame } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('▼ Others'), 1000);

    // Others = portainer running + restic paused → the approved uniform-
    // paused suffix stays.
    expect(frame).toContain('· paused');
    expect(frame).not.toContain('· exited');
  });

  it('never renders an exited suffix at group level, even for an all-exited group', async () => {
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
    const frame = await settle(lastFrame, f => f.includes('▼ backup'), 1000);

    // The all-exited group shows name + summary ONLY — no suffix.
    expect(frame).toContain('▼ backup 0/2');
    expect(frame).not.toContain('· exited');
    // The container rows and their lights still exist ('exited' as the
    // focused container's status word in the detail panel is fine).
    expect(frame).toContain('● backup-1');
    expect(frame).toContain('exited');
  });

  it('collapsing every group leaves only collapsed group rows, all selectable', async () => {
    const { lastFrame, stdin } = renderPage();
    await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);

    // monitoring↓: the cursor takes the collapsed row itself (index 0).
    await pressToggle(stdin, lastFrame, ' ', f => f.includes('❯ ▶ monitoring'));
    // j → caddy; space → proxy↓: the cursor takes proxy's collapsed row.
    await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● caddy'));
    await pressToggle(stdin, lastFrame, ' ', f => f.includes('❯ ▶ proxy'));
    // j → portainer; space → Others↓: the cursor takes Others' collapsed row.
    await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ ● portainer'));
    const allCollapsed = await pressToggle(stdin, lastFrame, ' ', f => f.includes('❯ ▶ Others'));

    expect(allCollapsed).toContain('  ▶ monitoring');
    expect(allCollapsed).toContain('  ▶ proxy');
    expect(allCollapsed).toContain('❯ ▶ Others');
    expect(allCollapsed).not.toContain('❯ ▼');
    expect(allCollapsed).not.toContain('grafana');
    expect(allCollapsed).not.toContain('caddy');
    expect(allCollapsed).not.toContain('portainer');
    expect(allCollapsed).not.toContain('restic');

    // A collapsed row is the handle: space on it reopens the group.
    const reopened = await pressToggle(stdin, lastFrame, ' ', f => f.includes('▼ Others'));

    expect(reopened).toContain('▼ Others');
    expect(reopened).toContain('❯ ● portainer');
    expect(reopened).toContain('  ▶ monitoring');
    expect(reopened).toContain('  ▶ proxy');
  });
});

describe('RemoteHomePage — footer hints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
    stubContainers({ result: { kind: 'ok', containers: CONTAINERS } });
  });

  it('publishes space collapse/expand while the dashboard is ok', async () => {
    const { lastFrame, unmount } = render(
      <>
        <RemoteHomePage remote='nas' sessionPassword={undefined} />
        <FooterSpy />
      </>
    );

    // Compound predicate with the FULL hint string — `footer:[` alone also
    // matches the pre-publication empty footer.
    const frame = await settle(
      lastFrame,
      f => f.includes('❯ ● grafana') && f.includes('footer:[space collapse/expand]'),
      1000
    );

    expect(frame).toContain('footer:[space collapse/expand]');
    unmount();
  });

  it('publishes no hints while loading', async () => {
    vi.mocked(getContainers).mockImplementation(() => new Promise<ContainersOutcome>(() => undefined));
    const { lastFrame, unmount } = render(
      <>
        <RemoteHomePage remote='nas' sessionPassword={undefined} />
        <FooterSpy />
      </>
    );

    const frame = await settle(lastFrame, f => f.includes('Connecting to nas…'), 1000);

    expect(frame).toContain('footer:[]');
    unmount();
  });
});

describe('RemoteHomePage — states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageHintsStore.setState({ hints: [], formMode: false });
  });

  it('renders the loading state while the fetch is in flight', async () => {
    let resolveFetch!: (outcome: ContainersOutcome) => void;
    vi.mocked(getContainers).mockImplementation(
      () =>
        new Promise<ContainersOutcome>(resolve => {
          resolveFetch = resolve;
        })
    );
    const { lastFrame, unmount } = renderPage();

    const loading = await settle(lastFrame, f => f.includes('Connecting to nas…'), 1000);
    expect(loading).toContain('Connecting to nas…');
    expect(loading).toContain('Fetching containers…');
    expect(loading).not.toContain('grafana');

    resolveFetch({ kind: 'ok', containers: CONTAINERS });
    await settle(lastFrame, f => f.includes('❯ ● grafana'), 1000);
    unmount();
  });

  it('renders the empty state when the remote runs no containers', async () => {
    stubContainers({ result: { kind: 'ok', containers: [] } });
    const { lastFrame } = renderPage();

    const empty = await settle(lastFrame, f => f.includes('no containers found'), 1000);
    expect(empty).toContain('no containers found on nas.');
  });

  it('renders the error state with the refusal reason verbatim', async () => {
    stubContainers({ result: { kind: 'refusal', reason: 'docker ps line 1 is not valid JSON' } });
    const { lastFrame } = renderPage();

    const error = await settle(lastFrame, f => f.includes('Unable to fetch containers'), 1000);
    expect(error).toContain('✖ Unable to fetch containers');
    expect(error).toContain('docker ps line 1 is not valid JSON');
    expect(error).toContain('Check that the host is reachable.');
  });
});
