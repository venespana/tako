// StatusPage.test.tsx — Unit tests for the status screen composition: the
// page consumes services/docker through its hook (the service is mocked here
// per the RemotesMenuPage style) and renders exactly one of the four
// designed states (loading / dashboard / empty / error), owns the r key and
// publishes the footer hints. Footer hints are asserted through a spy on the
// page-hints store (the footer itself is app-shell chrome). NOTE: the
// ink-testing-library harness strips ANSI, so health COLORS are asserted at
// the pure-model level (stack-status-view.test.ts); here we assert the
// status text of each health class renders.
import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StatusPage } from './StatusPage.js';
import type { GetStackStatusOutcome, StackStatusEntry } from '../../../../services/docker.js';
import { getStackStatus } from '../../../../services/docker.js';
import { usePageHintsStore } from '../../../shared/lib/page-hints-store.js';
import { pressAndSettle, settle } from '../../../test-utils/ink-interactions.js';

vi.mock('../../../../services/docker.js', async importOriginal => {
  // Spread the REAL module so the re-exported contract types keep working;
  // only the transport-bearing function is replaced.
  const actual = await importOriginal<typeof import('../../../../services/docker.js')>();
  return { ...actual, getStackStatus: vi.fn() };
});

/** The pen mock's stack set: running, exited and paused rows all present. */
const ENTRIES: StackStatusEntry[] = [
  { name: 'media', status: 'running(3)', configFiles: '/opt/media/compose.yaml' },
  { name: 'proxy', status: 'running(2)', configFiles: '/opt/proxy/compose.yaml' },
  { name: 'monitoring', status: 'exited(1)', configFiles: '/opt/monitoring/compose.yaml' },
  { name: 'homeassistant', status: 'paused', configFiles: '/opt/homeassistant/compose.yaml' },
  { name: 'backup', status: 'running(1)', configFiles: '/opt/backup/compose.yaml' },
  { name: 'downloads', status: 'exited(2)', configFiles: '/opt/downloads/compose.yaml' },
];

function stubStatus(outcome: { result?: GetStackStatusOutcome; error?: Error }): ReturnType<typeof vi.fn> {
  const fetch = vi.fn((): Promise<GetStackStatusOutcome> =>
    Promise.resolve(outcome.result ?? { kind: 'ok', entries: [] })
  );

  vi.mocked(getStackStatus).mockImplementation(fetch);

  return fetch;
}

/** Deferred service: the test controls when (and with what) it resolves. */
function stubDeferred(): (outcome: GetStackStatusOutcome) => void {
  let resolveFetch: ((outcome: GetStackStatusOutcome) => void) | null = null;

  vi.mocked(getStackStatus).mockImplementation(
    () =>
      new Promise<GetStackStatusOutcome>(resolve => {
        resolveFetch = resolve;
      })
  );

  return outcome => resolveFetch?.(outcome);
}

const flush = () => new Promise(resolve => setTimeout(resolve, 30));

/** Renders the page the way the route shim does, plus a footer hints spy. */
function renderPage(props: { remote?: string; sessionPassword?: string | undefined } = {}) {
  return render(
    <>
      <StatusPage remote={props.remote ?? 'nas'} sessionPassword={props.sessionPassword} />
      <FooterSpy />
    </>
  );
}

/** Renders the hints the page currently publishes (stands in for the footer). */
function FooterSpy(): React.ReactElement {
  const hints = usePageHintsStore(state => state.hints);

  return <Text>footer:[{hints.map(hint => `${hint.key} ${hint.label}`).join(' · ')}]</Text>;
}

beforeEach(() => {
  // 9.20: the footer hints are a module-scope zustand store — reset it so no
  // test inherits a previous test's publication.
  vi.clearAllMocks();
  usePageHintsStore.setState({ hints: [], formMode: false });
  stubStatus({ result: { kind: 'ok', entries: ENTRIES } });
});

describe('StatusPage (dashboard)', () => {
  it('renders heading, meta line and the stat strip numbers', async () => {
    const { lastFrame, unmount } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('STACKS'));

    expect(frame).toContain('Status');
    expect(frame).toContain('6 stacks');
    expect(frame).toMatch(/updated \d{2}:\d{2}/);
    expect(frame).toContain('STACKS');
    expect(frame).toContain('RUNNING');
    expect(frame).toContain('STOPPED');

    // Stat values render as one strip line of side-by-side columns:
    // total 6, running 3, stopped 3 (paused counts as stopped).
    const lines = frame.split('\n').map(line => line.trim());
    expect(lines.some(line => /^6\s+3\s+3$/.test(line))).toBe(true);
    unmount();
  });

  it('renders every stack row with name, status and config', async () => {
    const { lastFrame, unmount } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('CONFIG FILES'));

    expect(frame).toContain('NAME');
    expect(frame).toContain('STATUS');
    expect(frame).toContain('CONFIG FILES');

    ['media', 'proxy', 'monitoring', 'homeassistant', 'backup', 'downloads'].forEach(name => {
      expect(frame).toContain(name);
    });

    // All three health classes render their status text (colors are asserted
    // in stack-status-view.test.ts — the harness strips ANSI).
    expect(frame).toContain('running(3)');
    expect(frame).toContain('exited(1)');
    expect(frame).toContain('paused');
    expect(frame).toContain('/opt/media/compose.yaml');
    unmount();
  });

  it('starts the cursor on the first row and mirrors it in the detail column', async () => {
    const { lastFrame, unmount } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('CONFIG FILES'));

    expect(frame).toContain(`❯ media`);
    expect(frame).not.toContain(`❯ proxy`);
    expect(frame).toContain('STATUS running(3)');
    expect(frame).toContain('CONFIG /opt/media/compose.yaml');
    unmount();
  });

  it('moves the cursor with j — the detail column follows', async () => {
    const { stdin, lastFrame, unmount } = renderPage();
    await settle(lastFrame, f => f.includes('CONFIG FILES'));

    const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ proxy'));

    expect(frame).toContain('❯ proxy');
    expect(frame).not.toContain('❯ media');
    expect(frame).toContain('STATUS running(2)');
    unmount();
  });
});

describe('StatusPage (r key)', () => {
  it('r refreshes: back through loading, then renders the new outcome', async () => {
    const { stdin, lastFrame, unmount } = renderPage();
    await settle(lastFrame, f => f.includes('STACKS'));
    expect(vi.mocked(getStackStatus)).toHaveBeenCalledTimes(1);

    const resolveSecond = stubDeferred();
    await pressAndSettle(stdin, lastFrame, 'r', f => f.includes('Connecting to nas…'));
    resolveSecond({ kind: 'ok', entries: [] });

    const frame = await settle(lastFrame, f => f.includes('no compose stacks found'));
    expect(vi.mocked(getStackStatus)).toHaveBeenCalledTimes(2);
    expect(frame).toContain('no compose stacks found');
    unmount();
  });
});

describe('StatusPage (loading / empty / error states)', () => {
  it('loading: heading, remote meta, connecting line and spinner label', async () => {
    stubDeferred();
    const { lastFrame, unmount } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('Fetching stack status…'));

    expect(frame).toContain('Status');
    expect(frame).toContain('nas');
    expect(frame).toContain('Connecting to nas…');
    expect(frame).toContain('Fetching stack status…');
    expect(frame).not.toContain('STACKS');
    unmount();
  });

  it('empty: the three designed lines', async () => {
    stubStatus({ result: { kind: 'ok', entries: [] } });
    const { lastFrame, unmount } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('no compose stacks found'));

    expect(frame).toContain('Status');
    expect(frame).toContain('nas · 0 stacks');
    expect(frame).toContain('docker compose ls returned no stacks on nas.');
    expect(frame).toContain('Deploy a stack on the host, then press r to refresh.');
    unmount();
  });

  it('error: refusal headline, the reason verbatim and the retry line', async () => {
    stubStatus({ result: { kind: 'refusal', reason: 'compose ls output is not a JSON array' } });
    const { lastFrame, unmount } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('Unable to fetch stack status'));

    expect(frame).toContain('✖ Unable to fetch stack status');
    expect(frame).toContain('compose ls output is not a JSON array');
    expect(frame).toContain('Check that the host is reachable, then press r to retry.');
    unmount();
  });

  it('renders nothing without a remote — the shim owns the redirect', async () => {
    // No footer spy: the assertion is that the PAGE contributes no output.
    const { lastFrame, unmount } = render(<StatusPage remote='' sessionPassword={undefined} />);
    await flush();

    expect(lastFrame() ?? '').toBe('');
    expect(vi.mocked(getStackStatus)).not.toHaveBeenCalled();
    unmount();
  });
});

describe('StatusPage footer hint publication (9.15a: single writer per page)', () => {
  it('dashboard and empty publish r refresh; error publishes r retry; loading none', async () => {
    const { lastFrame, unmount } = renderPage();

    // Loading first: no hints.
    const loading = await settle(lastFrame, f => f.includes('footer:['));
    expect(loading).toContain('footer:[]');

    // Dashboard: refresh.
    const dashboard = await settle(lastFrame, f => f.includes('footer:[r refresh]'));
    expect(dashboard).toContain('footer:[r refresh]');
    unmount();

    // Error: retry.
    stubStatus({ result: { kind: 'refusal', reason: 'boom' } });
    const failed = renderPage();

    const errorFrame = await settle(failed.lastFrame, f => f.includes('footer:[r retry]'));
    expect(errorFrame).toContain('footer:[r retry]');
    failed.unmount();
  });
});
