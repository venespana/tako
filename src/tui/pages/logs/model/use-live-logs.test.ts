// use-live-logs.test.ts — Unit tests for the logs screen's data hook
// (tui-live-logs T2, batch flush in T5): the connecting → streaming → ended |
// error state machine over services/docker (streamContainerLogs), verbatim
// error reasons (unknown-remote, refusal, transport — corrupt output never
// renders as fake data), the 500-line ring (oldest dropped, including under a
// one-tick burst), the ~100ms batch flush (a flood lands in ONE flush, and
// pending lines still flush before the ended phase lands), unmount stopping
// the handle exactly once, and a handle acquired AFTER unmount being stopped
// instead of leaked. The `r` reconnect is a keyed REMOUNT at the page (T8 C1
// — no attempt option here anymore); its stop-the-old-handle / fresh-empty-
// pass contract is asserted in LogsPage.test.tsx. The service is mocked per
// the use-remote-home style; a probe element renders the hook's state as
// text (createElement, keeping this file .ts).
import { createElement } from 'react';

import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FLUSH_INTERVAL_MS, useLiveLogs } from './use-live-logs.js';
import type { ContainerLogStreamHandle, StreamContainerLogsOutcome } from '../../../../services/docker.js';
import { streamContainerLogs } from '../../../../services/docker.js';
import { settle } from '../../../test-utils/ink-interactions.js';

vi.mock('../../../../services/docker.js', async importOriginal => {
  // Spread the REAL module so the re-exported contract types keep working;
  // only the transport-bearing function is replaced.
  const actual = await importOriginal<typeof import('../../../../services/docker.js')>();
  return { ...actual, streamContainerLogs: vi.fn() };
});

interface FakeStreamHandle extends ContainerLogStreamHandle {
  emit(line: string): void;
  endStream(): void;
  fail(error: Error): void;
}

/** A test-controlled handle with the adapter's exact consumption semantics. */
function createFakeHandle(): FakeStreamHandle {
  const buffer: string[] = [];
  let waiters: Array<{ resolve: (line: string | null) => void; reject: (error: Error) => void }> = [];
  let finished = false;
  let failure: Error | undefined;
  let settleDone!: (outcome: 'stopped' | 'ended') => void;
  const done = new Promise<'stopped' | 'ended'>(resolve => {
    settleDone = resolve;
  });

  const wake = (): void => {
    const parked = waiters;
    waiters = [];

    parked.forEach(waiter => {
      if (failure !== undefined) waiter.reject(failure);
      else if (finished) waiter.resolve(null);
      else waiter.resolve(buffer.shift() ?? null);
    });
  };

  const stop = vi.fn(async (): Promise<void> => {
    if (finished) return;

    finished = true;
    settleDone('stopped');
    wake();
  });

  return {
    lines: {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<string>> {
            const buffered = buffer.shift();

            if (buffered !== undefined) return { value: buffered, done: false };

            if (failure !== undefined) throw failure;

            if (finished) return { value: undefined, done: true };

            const line = await new Promise<string | null>((resolve, reject) => waiters.push({ resolve, reject }));

            return line === null ? { value: undefined, done: true } : { value: line, done: false };
          },
        };
      },
    },
    stop,
    done,
    emit(line: string): void {
      if (waiters.length > 0) {
        const parked = waiters[0];
        waiters = [];
        parked?.resolve(line);
        return;
      }

      buffer.push(line);
    },
    endStream(): void {
      finished = true;
      settleDone('ended');
      wake();
    },
    fail(error: Error): void {
      failure = error;
      wake();
    },
  };
}

function stubStream(result: { outcome?: StreamContainerLogsOutcome; error?: Error; deferred?: boolean }): {
  handle: FakeStreamHandle;
  resolve: (outcome: StreamContainerLogsOutcome) => void;
} {
  const handle = createFakeHandle();
  let resolveDeferred!: (outcome: StreamContainerLogsOutcome) => void;
  const acquisition = new Promise<StreamContainerLogsOutcome>(resolve => {
    resolveDeferred = resolve;
  });

  vi.mocked(streamContainerLogs).mockImplementation(() => {
    if (result.deferred) return acquisition;

    if (result.error !== undefined) return Promise.reject(result.error);

    return Promise.resolve(result.outcome ?? { kind: 'ok', stream: handle });
  });

  return { handle, resolve: resolveDeferred };
}

function Probe({
  remote = 'nas',
  container = 'web-1',
  enabled = true,
  renderLog,
}: {
  remote?: string;
  container?: string;
  enabled?: boolean;
  /** Test instrument: line count at every render (flush-batch assertions). */
  renderLog?: number[];
}) {
  const { state, lines } = useLiveLogs({
    remote,
    sessionPassword: undefined,
    container,
    enabled,
  });

  renderLog?.push(lines.length);

  const detail = state.phase === 'error' ? ` reason:${state.reason}` : '';

  // `first`/`last` bracket the ring so tests can see order, not just size.
  return createElement(
    Text,
    null,
    `phase:${state.phase}${detail} count:${lines.length} first:${lines[0] ?? '-'} last:${lines.at(-1) ?? '-'}`
  );
}

const flush = () => new Promise(resolve => setTimeout(resolve, 30));

describe('useLiveLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubStream({ outcome: { kind: 'ok', stream: createFakeHandle() } });
  });

  it('acquires once on mount: connecting until the handle exists, then streaming', async () => {
    const { handle, resolve } = stubStream({ deferred: true });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const connecting = await settle(lastFrame, frame => frame.includes('phase:connecting'), 200);
    expect(connecting).toContain('phase:connecting');

    resolve({ kind: 'ok', stream: handle });
    const streaming = await settle(lastFrame, frame => frame.includes('phase:streaming'));
    expect(streaming).toContain('phase:streaming');
    expect(vi.mocked(streamContainerLogs)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(streamContainerLogs)).toHaveBeenCalledWith({
      remote: 'nas',
      sessionPassword: undefined,
      container: 'web-1',
    });
    unmount();
  });

  it('appends lines as they arrive and caps the ring at 500 (oldest dropped)', async () => {
    const { handle } = stubStream({});
    const { lastFrame, unmount } = render(createElement(Probe, null));
    await settle(lastFrame, frame => frame.includes('phase:streaming'));

    handle.emit('early-line');
    const first = await settle(lastFrame, frame => frame.includes('last:early-line'));
    expect(first).toContain('count:1');

    Array.from({ length: 600 }, (_, index) => index).forEach(index => handle.emit(`n${index}`));

    const capped = await settle(lastFrame, frame => frame.includes('last:n599'));
    expect(capped).toContain('count:500');
    expect(capped).toContain('last:n599');
    unmount();
  });

  it('renders a ~140 lines/s flood once per flush window — all lines land, complete and ordered', async () => {
    const { handle } = stubStream({});
    const renderLog: number[] = [];
    const { lastFrame, unmount } = render(createElement(Probe, { renderLog }));
    await settle(lastFrame, frame => frame.includes('phase:streaming'));

    vi.useFakeTimers();

    try {
      // The flood as production delivers it: one line per arriving tick
      // (each SSH data event is its own task). Arriving inside ONE
      // synchronous loop would let React's auto-batching coalesce per-line
      // updates and hide the defect.
      Array.from({ length: 140 }, (_, index) => index).forEach(index => {
        setTimeout(() => handle.emit(`burst-${index}`), index + 1);
      });

      // Halfway through the flood: every line so far is buffered and the
      // screen has rendered NOTHING new (the per-line code had already
      // re-rendered ~70 times here).
      await vi.advanceTimersByTimeAsync(70);
      await vi.advanceTimersByTimeAsync(0);

      expect(lastFrame()).toContain('count:0');

      // Past the last arrival and a full flush window: everything landed,
      // in order.
      await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS + 200);
      await vi.advanceTimersByTimeAsync(0);

      const flushed = lastFrame() ?? '';

      expect(flushed).toContain('count:140');
      expect(flushed).toContain('first:burst-0');
      expect(flushed).toContain('last:burst-139');
    } finally {
      vi.useRealTimers();
    }

    // Render budget: 2 pre-stream + at most one render per ~100ms window
    // over the ~140ms flood (the per-line code rendered once per line,
    // ~140 times).
    expect(renderLog.length).toBeLessThanOrEqual(6);

    unmount();
  });

  it('caps the ring at 500 under a 600-line one-tick burst (batch append drops the oldest)', async () => {
    const { handle } = stubStream({});
    const { lastFrame, unmount } = render(createElement(Probe, null));
    await settle(lastFrame, frame => frame.includes('phase:streaming'));

    Array.from({ length: 600 }, (_, index) => index).forEach(index => handle.emit(`flood-${index}`));

    const capped = await settle(lastFrame, frame => frame.includes('last:flood-599'));

    expect(capped).toContain('count:500');
    expect(capped).toContain('first:flood-100');
    expect(capped).toContain('last:flood-599');
    unmount();
  });

  it('flushes pending buffered lines before the ended phase lands (complete tail at the status change)', async () => {
    const { handle } = stubStream({});
    const { lastFrame, unmount } = render(createElement(Probe, null));
    await settle(lastFrame, frame => frame.includes('phase:streaming'));

    handle.emit('pending-1');
    handle.emit('pending-2');
    handle.endStream();

    const ended = await settle(lastFrame, frame => frame.includes('phase:ended'));

    expect(ended).toContain('phase:ended');
    expect(ended).toContain('count:2');
    expect(ended).toContain('first:pending-1');
    expect(ended).toContain('last:pending-2');
    unmount();
  });

  it('maps a refusal outcome to error with the reason verbatim', async () => {
    stubStream({ outcome: { kind: 'refusal', reason: 'invalid container name "we b"' } });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const error = await settle(lastFrame, frame => frame.includes('phase:error'));
    expect(error).toContain('reason:invalid container name "we b"');
    unmount();
  });

  it('maps unknown-remote to error with the reason', async () => {
    stubStream({ outcome: { kind: 'unknown-remote', reason: 'no remote named ghost' } });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const error = await settle(lastFrame, frame => frame.includes('phase:error'));
    expect(error).toContain('reason:no remote named ghost');
    unmount();
  });

  it('maps an acquisition rejection (transport failure) to error', async () => {
    stubStream({ error: new Error('ssh channel open failed') });
    const { lastFrame, unmount } = render(createElement(Probe, null));

    const error = await settle(lastFrame, frame => frame.includes('phase:error'));
    expect(error).toContain('reason:ssh channel open failed');
    unmount();
  });

  it('maps an iterator failure to error with its message', async () => {
    const { handle } = stubStream({});
    const { lastFrame, unmount } = render(createElement(Probe, null));
    await settle(lastFrame, frame => frame.includes('phase:streaming'));

    handle.emit('before-drop');
    handle.fail(new Error('dropped mid-stream'));

    const error = await settle(lastFrame, frame => frame.includes('phase:error'));
    expect(error).toContain('reason:dropped mid-stream');
    unmount();
  });

  it('lands in ended when the remote docker logs process exits', async () => {
    const { handle } = stubStream({});
    const { lastFrame, unmount } = render(createElement(Probe, null));
    await settle(lastFrame, frame => frame.includes('phase:streaming'));

    handle.emit('final output');
    handle.endStream();

    const ended = await settle(lastFrame, frame => frame.includes('phase:ended'));
    expect(ended).toContain('phase:ended');
    expect(ended).toContain('last:final output');
    unmount();
  });

  it('a keepalive-style channel close (done: ended) stops the handle exactly once, and unmount adds no second stop (FU3/FU7)', async () => {
    const { handle } = stubStream({});
    const { lastFrame, unmount } = render(createElement(Probe, null));
    await settle(lastFrame, frame => frame.includes('phase:streaming'));

    handle.emit('final heartbeat');
    // The keepalive closed the channel: the iterator ends AND done settles
    // 'ended' — the remote side is gone without any unmount or `r`.
    handle.endStream();

    const ended = await settle(lastFrame, frame => frame.includes('phase:ended'));

    // The hook must close the connection itself now: the handle's stop.
    expect(ended).toContain('phase:ended');
    expect(handle.stop).toHaveBeenCalledTimes(1);

    // Unmounting afterwards must not add a second stop (idempotent-safe,
    // but the lifecycle is exactly one stop per pass).
    unmount();
    await flush();

    expect(handle.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the handle exactly once on unmount', async () => {
    const { handle } = stubStream({});
    const { lastFrame, unmount } = render(createElement(Probe, null));
    await settle(lastFrame, frame => frame.includes('phase:streaming'));

    unmount();
    await flush();

    expect(handle.stop).toHaveBeenCalledTimes(1);
  });

  it('stops a handle that is only acquired after unmount (never leaked)', async () => {
    const { handle, resolve } = stubStream({ deferred: true });
    const { unmount } = render(createElement(Probe, null));

    unmount();
    resolve({ kind: 'ok', stream: handle });
    await flush();

    expect(handle.stop).toHaveBeenCalledTimes(1);
  });

  it('stays inert when disabled (no acquisition)', async () => {
    const { lastFrame, unmount } = render(createElement(Probe, { enabled: false }));
    await flush();

    expect(vi.mocked(streamContainerLogs)).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('phase:connecting');
    unmount();
  });
});
