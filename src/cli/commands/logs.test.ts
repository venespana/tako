// logs.test.ts — CLI endpoint contract for `tako logs <stack> [--host X] [-f]`
// (T1-cli-logs). runLogs is the ADR-0019 glue (parse → service → print →
// exit code) over an injected io, with the service mocked — no real SSH in
// unit tests. Exit codes follow docs/commands.md conventions: 0 ok ·
// 1 refusal/invalid usage · 2 unexpected failure.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { runLogs } from './logs.js';
import type { LogsIo } from './logs.js';
import type { StackLogStreamHandle } from '../../services/docker.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';

const streamStackLogsMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/docker.js', () => ({
  streamStackLogs: streamStackLogsMock,
}));

function handleServing(lines: readonly string[]): StackLogStreamHandle {
  let index = 0;

  return {
    lines: {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<string>> => {
          if (index < lines.length) {
            const value = lines[index];
            index += 1;

            if (value === undefined) return { value: undefined, done: true };

            return { value, done: false };
          }

          return { value: undefined, done: true };
        },
      }),
    },
    stop: vi.fn(async () => {}),
    done: Promise.resolve('ended'),
  };
}

function createIo(): { io: LogsIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];

  return {
    io: {
      log: line => {
        out.push(line);
      },
      error: line => {
        err.push(line);
      },
    },
    out,
    err,
  };
}

describe('runLogs — flag parsing (loud refusals)', () => {
  beforeEach(() => {
    streamStackLogsMock.mockReset();
  });

  it('refuses a missing --host loudly without touching the service', async () => {
    const { io, out, err } = createIo();
    const exit = await runLogs('media', {}, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('--host');
    expect(streamStackLogsMock).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });

  it('refuses an empty --host the same way', async () => {
    const { io, err } = createIo();
    const exit = await runLogs('media', { host: '' }, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('--host');
    expect(streamStackLogsMock).not.toHaveBeenCalled();
  });
});

describe('runLogs — outcome mapping (0 ok · 1 refusal · 2 unexpected)', () => {
  beforeEach(() => {
    streamStackLogsMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prints the log lines and exits 0 on a plain (non-follow) run, passing the session password', async () => {
    vi.stubEnv(SESSION_PASSWORD_ENV, 'session-pw');
    streamStackLogsMock.mockResolvedValue({ kind: 'ok', stream: handleServing(['line one', 'line two']) });
    const { io, out, err } = createIo();

    const exit = await runLogs('media', { host: 'nas' }, io);

    expect(exit).toBe(0);
    expect(streamStackLogsMock).toHaveBeenCalledWith({
      remote: 'nas',
      stack: 'media',
      follow: false,
      sessionPassword: 'session-pw',
    });
    expect(out).toEqual(['line one', 'line two']);
    expect(err).toEqual([]);
  });

  it('defaults follow to false when the flag is absent', async () => {
    streamStackLogsMock.mockResolvedValue({ kind: 'ok', stream: handleServing([]) });
    const { io } = createIo();

    await runLogs('media', { host: 'nas' }, io);

    expect(streamStackLogsMock.mock.calls[0]?.[0]).toMatchObject({ follow: false });
  });

  it('requests follow mode when -f is given and still exits 0 when the remote side ends', async () => {
    streamStackLogsMock.mockResolvedValue({ kind: 'ok', stream: handleServing(['live line']) });
    const { io, out } = createIo();

    const exit = await runLogs('media', { host: 'nas', follow: true }, io);

    expect(exit).toBe(0);
    expect(streamStackLogsMock).toHaveBeenCalledWith(
      expect.objectContaining({ remote: 'nas', stack: 'media', follow: true })
    );
    expect(out).toEqual(['live line']);
  });

  it('stops the stream and exits 0 on SIGINT mid-follow (real signal, parked iterator)', async () => {
    // A live follow: one line already delivered, then parked forever until
    // stop() releases it — exactly the SIGINT sequence against runLogs.
    let release: (() => void) | undefined;
    const parked = new Promise<void>(resolve => {
      release = resolve;
    });
    const queue: string[] = ['before'];
    const stop = vi.fn(async () => {
      queue.length = 0;
      release?.();
    });
    const handle: StackLogStreamHandle = {
      lines: {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            const line = queue.shift();

            if (line !== undefined) return { value: line, done: false };

            // Parked: only stop() (via SIGINT or teardown) releases us.
            await parked;

            return { value: undefined, done: true };
          },
        }),
      },
      stop,
      done: Promise.resolve('stopped'),
    };
    streamStackLogsMock.mockResolvedValue({ kind: 'ok', stream: handle });
    const { io, out, err } = createIo();

    const exitPromise = runLogs('media', { host: 'nas', follow: true }, io);
    await new Promise(resolve => setTimeout(resolve, 0)); // let the stream deliver and park first
    process.emit('SIGINT');
    const exit = await exitPromise;

    expect(exit).toBe(0);
    expect(stop).toHaveBeenCalled();
    expect(out).toEqual(['before']);
    expect(err).toEqual([]);
  });

  it('always stops the handle on a natural end (the service owns the connection teardown)', async () => {
    const handle = handleServing(['done']);
    streamStackLogsMock.mockResolvedValue({ kind: 'ok', stream: handle });
    const { io } = createIo();

    await runLogs('media', { host: 'nas' }, io);

    expect(handle.stop).toHaveBeenCalledTimes(1);
  });

  it('maps an unknown remote to exit 1 with the reason on stderr', async () => {
    streamStackLogsMock.mockResolvedValue({ kind: 'unknown-remote', reason: 'unknown remote "nope"' });
    const { io, out, err } = createIo();

    const exit = await runLogs('media', { host: 'nope' }, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('unknown remote "nope"');
    expect(out).toEqual([]);
  });

  it('maps a refusal (unknown stack, ssh failure, invalid name) to exit 1 with the reason on stderr', async () => {
    streamStackLogsMock.mockResolvedValue({ kind: 'refusal', reason: 'invalid stack name "a b"' });
    const { io, err } = createIo();

    const exit = await runLogs('a b', { host: 'nas' }, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('invalid stack name "a b"');
  });

  it('maps an unexpected throw to exit 2', async () => {
    streamStackLogsMock.mockRejectedValue(new Error('transport exploded'));
    const { io, err } = createIo();

    const exit = await runLogs('media', { host: 'nas' }, io);

    expect(exit).toBe(2);
    expect(err.join('\n')).toContain('transport exploded');
  });
});

describe('runLogs — remote failure is not masked as success (R3)', () => {
  beforeEach(() => {
    streamStackLogsMock.mockReset();
  });

  function handleWithRemoteExit(
    lines: readonly string[],
    remoteExitCode: number | null,
    stderrTail: string
  ): StackLogStreamHandle & { remoteExitCode: number | null; stderrTail: string } {
    return { ...handleServing(lines), remoteExitCode, stderrTail };
  }

  it('exits 1 with the remote stderr when the remote compose command fails (non-zero exit)', async () => {
    streamStackLogsMock.mockResolvedValue({
      kind: 'ok',
      stream: handleWithRemoteExit(['no configuration file found'], 1, 'no configuration file found: media'),
    });
    const { io, out, err } = createIo();

    const exit = await runLogs('media', { host: 'nas' }, io);

    expect(exit).toBe(1);
    expect(err.join('\n')).toContain('exited with code 1');
    expect(err.join('\n')).toContain('no configuration file found: media');
    expect(out).toEqual(['no configuration file found']);
  });

  it('exits 0 when the remote command reports exit code 0', async () => {
    streamStackLogsMock.mockResolvedValue({
      kind: 'ok',
      stream: handleWithRemoteExit(['all good'], 0, ''),
    });
    const { io, out, err } = createIo();

    const exit = await runLogs('media', { host: 'nas' }, io);

    expect(exit).toBe(0);
    expect(err).toEqual([]);
    expect(out).toEqual(['all good']);
  });

  it('exits 2 when the remote stream ends without any exit status (cannot attest success)', async () => {
    streamStackLogsMock.mockResolvedValue({
      kind: 'ok',
      stream: handleWithRemoteExit(['partial'], null, ''),
    });
    const { io, err } = createIo();

    const exit = await runLogs('media', { host: 'nas' }, io);

    expect(exit).toBe(2);
    expect(err.join('\n')).toContain('exit status');
  });
});

describe('runLogs — stdout flush before exit (R4)', () => {
  beforeEach(() => {
    streamStackLogsMock.mockReset();
  });

  it('awaits every write callback before returning, so piped output never truncates', async () => {
    const flushed: boolean[] = [];
    const pending: Array<() => void> = [];
    const io: LogsIo = {
      log: () =>
        new Promise<void>(resolve => {
          pending.push(() => {
            flushed.push(true);
            resolve();
          });
        }),
      error: () => {},
    };
    streamStackLogsMock.mockResolvedValue({ kind: 'ok', stream: handleServing(['a', 'b']) });

    const run = runLogs('media', { host: 'nas' }, io);
    await new Promise(resolve => setTimeout(resolve, 0)); // both/first writes enqueued, none flushed

    expect(flushed).toEqual([]); // runLogs must still be waiting on the write callbacks
    pending.splice(0).forEach(release => release()); // flush 'a'
    await new Promise(resolve => setTimeout(resolve, 0)); // let runLogs enqueue the next write
    expect(pending.length).toBe(1); // 'b' pending: the run is STILL waiting, never early-exits
    pending.splice(0).forEach(release => release()); // flush 'b'
    expect(await run).toBe(0);
    expect(flushed).toEqual([true, true]);
  });
});
