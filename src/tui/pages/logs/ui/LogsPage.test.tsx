// LogsPage.test.tsx — Unit tests for the live logs screen (tui-live-logs
// T2/T4; keyed-remount reconnect in T8): the dashboard (title, container·remote
// meta, per-phase status line, delivered lines), the ended status, the error
// view with the verbatim refusal reason (mirroring StatusError tone), the
// empty-container guard rendering nothing and acquiring nothing, the r
// reconnect (error/ended only — inert while streaming) going through the
// keyed REMOUNT: the old handle stops, a fresh acquisition starts, and the
// fresh pass renders connecting with an empty ring, and the footer hints
// publication. The service is mocked per the remote-home style; the fake
// handle delivers its lines then either stays open or ends. Footer hints are
// asserted through a spy on the page-hints store (the footer itself is
// app-shell chrome).
import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LogsPage } from './LogsPage.js';
import type { ContainerLogStreamHandle, StreamContainerLogsOutcome } from '../../../../services/docker.js';
import { streamContainerLogs } from '../../../../services/docker.js';
import { usePageHintsStore } from '../../../shared/lib/page-hints-store.js';
import { LOAD_TIMEOUT_MS, settle } from '../../../test-utils/ink-interactions.js';

vi.mock('../../../../services/docker.js', async importOriginal => {
  // Spread the REAL module so the re-exported contract types keep working;
  // only the transport-bearing function is replaced.
  const actual = await importOriginal<typeof import('../../../../services/docker.js')>();
  return { ...actual, streamContainerLogs: vi.fn() };
});

const never: Promise<IteratorResult<string>> = new Promise(() => undefined);

function fakeHandle(lines: readonly string[], end: 'open' | 'ended'): ContainerLogStreamHandle {
  const pending = [...lines];

  return {
    lines: {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<string>> {
            const line = pending.shift();

            if (line !== undefined) return { value: line, done: false };

            return end === 'ended' ? { value: undefined, done: true } : await never;
          },
        };
      },
    },
    stop: vi.fn(async () => {}),
    done: end === 'ended' ? Promise.resolve('ended') : new Promise<'stopped' | 'ended'>(() => undefined),
  };
}

/** A handle that delivers its lines, then dies with a transport error —
 * the error phase WITH a live handle behind it, so a reconnect has something
 * to stop. */
function failingHandle(lines: readonly string[], error: Error): ContainerLogStreamHandle {
  const pending = [...lines];
  let drained = false;

  return {
    lines: {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<string>> {
            if (drained) throw error;

            const line = pending.shift();

            if (line !== undefined) return { value: line, done: false };

            drained = true;
            throw error;
          },
        };
      },
    },
    stop: vi.fn(async () => {}),
    done: new Promise<'stopped' | 'ended'>(() => undefined),
  };
}

const renderPage = (container = 'web-1') =>
  render(<LogsPage remote='nas' sessionPassword={undefined} container={container} />);

/** Renders the page plus a footer hints spy (the footer itself is app-shell chrome). */
const renderPageWithSpy = (container = 'web-1') =>
  render(
    <>
      <LogsPage remote='nas' sessionPassword={undefined} container={container} />
      <FooterSpy />
    </>
  );

/** Renders the hints the page currently publishes (stands in for the footer). */
function FooterSpy(): React.ReactElement {
  const hints = usePageHintsStore(state => state.hints);

  return <Text>footer:[{hints.map(hint => `${hint.key} ${hint.label}`).join(' · ')}]</Text>;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 100));

describe('LogsPage — dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 9.20: the footer hints are a module-scope zustand store — reset it so
    // no test inherits a previous test's publication.
    usePageHintsStore.setState({ hints: [], formMode: false });
  });

  it(
    'renders the title, the container·remote meta, the streaming status and delivered lines',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      vi.mocked(streamContainerLogs).mockResolvedValue({
        kind: 'ok',
        stream: fakeHandle(['kernel: boot ok', 'caddy: serving :443'], 'open'),
      });

      const { lastFrame, unmount } = renderPage();
      const frame = await settle(lastFrame, f => f.includes('kernel: boot ok') && f.includes('serving :443'));

      expect(frame).toContain('logs');
      expect(frame).toContain('web-1 · nas');
      expect(frame).toContain('● streaming');
      expect(frame).toContain('kernel: boot ok');
      expect(frame).toContain('caddy: serving :443');
      unmount();
    }
  );

  it('renders the dim ended status once the remote process exits', { timeout: LOAD_TIMEOUT_MS }, async () => {
    vi.mocked(streamContainerLogs).mockResolvedValue({ kind: 'ok', stream: fakeHandle(['bye'], 'ended') });

    const { lastFrame, unmount } = renderPage();
    const frame = await settle(lastFrame, f => f.includes('● ended'));

    expect(frame).toContain('● ended');
    expect(frame).toContain('bye');
    unmount();
  });
});

describe('LogsPage — error and guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 9.20: the footer hints are a module-scope zustand store — reset it so
    // no test inherits a previous test's publication.
    usePageHintsStore.setState({ hints: [], formMode: false });
  });

  it(
    'renders the error view with the refusal reason verbatim and the retry hint',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      vi.mocked(streamContainerLogs).mockResolvedValue({
        kind: 'unknown-remote',
        reason: 'unknown remote "ghost"',
      });

      const { lastFrame, unmount } = renderPage();
      const frame = await settle(lastFrame, f => f.includes('✖ Unable to stream logs'));

      expect(frame).toContain('✖ Unable to stream logs');
      expect(frame).toContain('unknown remote "ghost"');
      expect(frame).toContain('Check that the host is reachable, then press r to reconnect.');
      unmount();
    }
  );

  it('renders nothing and acquires nothing when the container is empty', { timeout: LOAD_TIMEOUT_MS }, async () => {
    const { lastFrame, unmount } = renderPage('');

    expect(lastFrame()?.trim()).toBe('');
    expect(vi.mocked(streamContainerLogs)).not.toHaveBeenCalled();
    unmount();
  });

  it(
    'renders nothing and acquires nothing when the remote is empty (FU4: no real acquisition before the shim redirect)',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const { lastFrame, unmount } = render(<LogsPage remote='' sessionPassword={undefined} container='web-1' />);

      expect(lastFrame()?.trim()).toBe('');
      expect(vi.mocked(streamContainerLogs)).not.toHaveBeenCalled();
      unmount();
    }
  );
});

describe('LogsPage — r reconnect and footer hints (T4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 9.20: the footer hints are a module-scope zustand store — reset it so
    // no test inherits a previous test's publication.
    usePageHintsStore.setState({ hints: [], formMode: false });
  });

  it('r in the error phase reconnects: the stream re-acquires and recovers', { timeout: LOAD_TIMEOUT_MS }, async () => {
    vi.mocked(streamContainerLogs)
      .mockResolvedValueOnce({ kind: 'unknown-remote', reason: 'unknown remote "ghost"' })
      .mockResolvedValueOnce({ kind: 'ok', stream: fakeHandle(['recovered line'], 'open') });

    const { stdin, lastFrame, unmount } = renderPage();
    await settle(lastFrame, f => f.includes('✖ Unable to stream logs'));
    expect(vi.mocked(streamContainerLogs)).toHaveBeenCalledTimes(1);

    stdin.write('r');

    const frame = await settle(lastFrame, f => f.includes('recovered line'));
    expect(vi.mocked(streamContainerLogs)).toHaveBeenCalledTimes(2);
    expect(frame).toContain('● streaming');
    unmount();
  });

  it(
    'r after a mid-stream error stops the old handle and remounts into a fresh empty pass (T8)',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const staleHandle = failingHandle(['stale-line'], new Error('connection dropped'));
      let resolveSecond!: (outcome: StreamContainerLogsOutcome) => void;
      const secondAcquisition = new Promise<StreamContainerLogsOutcome>(resolve => {
        resolveSecond = resolve;
      });

      vi.mocked(streamContainerLogs)
        .mockResolvedValueOnce({ kind: 'ok', stream: staleHandle })
        .mockReturnValueOnce(secondAcquisition);

      const { stdin, lastFrame, unmount } = renderPage();

      // Live then dead: the transport error surfaces with the stale handle
      // behind it (the ring still holds its line).
      await settle(lastFrame, f => f.includes('✖ Unable to stream logs'));
      expect(lastFrame()).toContain('connection dropped');

      stdin.write('r');
      await flush();

      // The keyed remount stopped the superseded pass's handle exactly once
      // and started the fresh acquisition.
      expect(staleHandle.stop).toHaveBeenCalledTimes(1);
      expect(vi.mocked(streamContainerLogs)).toHaveBeenCalledTimes(2);

      // The fresh pass renders as CONNECTING with an EMPTY ring — the dead
      // pass's error view and its stale tail are gone in the same commit.
      const fresh = await settle(lastFrame, f => f.includes('● connecting'));

      expect(fresh).toContain('● connecting');
      expect(fresh).not.toContain('✖ Unable to stream logs');
      expect(fresh).not.toContain('stale-line');

      resolveSecond({ kind: 'ok', stream: fakeHandle(['fresh-line'], 'open') });

      const recovered = await settle(lastFrame, f => f.includes('fresh-line'));

      expect(recovered).toContain('● streaming');
      expect(staleHandle.stop).toHaveBeenCalledTimes(1);
      unmount();
    }
  );

  it(
    'r while streaming is inert: no second acquisition and the live handle is untouched',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      const handle = fakeHandle(['live line'], 'open');
      vi.mocked(streamContainerLogs).mockResolvedValue({ kind: 'ok', stream: handle });

      const { stdin, lastFrame, unmount } = renderPage();
      await settle(lastFrame, f => f.includes('● streaming'));
      expect(vi.mocked(streamContainerLogs)).toHaveBeenCalledTimes(1);

      stdin.write('r');
      await flush();

      expect(vi.mocked(streamContainerLogs)).toHaveBeenCalledTimes(1);
      expect(handle.stop).not.toHaveBeenCalled();
      unmount();
    }
  );

  it(
    'publishes r reconnect only in the error and ended phases; connecting/streaming publish none',
    { timeout: LOAD_TIMEOUT_MS },
    async () => {
      // Error: r reconnect.
      vi.mocked(streamContainerLogs).mockResolvedValue({ kind: 'unknown-remote', reason: 'boom' });
      const failed = renderPageWithSpy();
      const errorFrame = await settle(failed.lastFrame, f => f.includes('footer:[r reconnect]'));
      expect(errorFrame).toContain('footer:[r reconnect]');
      failed.unmount();

      // Streaming: none — back/quit stay the only footer.
      vi.mocked(streamContainerLogs).mockResolvedValue({ kind: 'ok', stream: fakeHandle(['tail line'], 'open') });
      const live = renderPageWithSpy();
      const liveFrame = await settle(live.lastFrame, f => f.includes('● streaming'));
      expect(liveFrame).toContain('footer:[]');
      live.unmount();

      // Ended: r reconnect again.
      vi.mocked(streamContainerLogs).mockResolvedValue({ kind: 'ok', stream: fakeHandle(['bye'], 'ended') });
      const done = renderPageWithSpy();
      const endedFrame = await settle(done.lastFrame, f => f.includes('footer:[r reconnect]'));
      expect(endedFrame).toContain('footer:[r reconnect]');
      done.unmount();
    }
  );
});
