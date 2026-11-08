// StreamContainerLogs.test.ts — use case contract (tui-live-logs T1): a
// container name failing the domain pattern is REFUSED before anything runs
// (the name is the one piece of caller input in the remote command — it is
// never interpolated unchecked), a valid name delegates to the port exactly
// once, and a port rejection (transport failure at acquisition) maps to a
// refusal object — an expected outcome never throws.
import { describe, expect, it, vi } from 'vitest';

import { StreamContainerLogs } from './StreamContainerLogs.js';
import type { ContainerLogStreamHandle, ContainerLogStreamer } from './StreamContainerLogs.js';

const inertHandle = (): ContainerLogStreamHandle => ({
  lines: {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ value: undefined, done: true }),
    }),
  },
  stop: async () => {},
  done: Promise.resolve('ended'),
});

function streamerWith(handle: ContainerLogStreamHandle): {
  stream: ReturnType<typeof vi.fn>;
  streamer: ContainerLogStreamer;
} {
  const stream = vi.fn(async () => handle);

  return { stream, streamer: { stream } as ContainerLogStreamer };
}

describe('StreamContainerLogs — name validation is the domain gate', () => {
  it.each(['web-1', 'a', 'My_App.2', 'x-y_z.9'])('accepts the docker-safe name %s and delegates once', async name => {
    const { stream, streamer } = streamerWith(inertHandle());

    const result = await new StreamContainerLogs(streamer).execute({ container: name, tail: 200 });

    expect(result.kind).toBe('ok');
    expect(stream).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledWith({ container: name, tail: 200 });
  });

  it.each(['', '-lead', '.dot', 'we b', 'web;rm', 'web$x', 'wèb', 'web\n1'])(
    'refuses the unsafe name %j without touching the port',
    async container => {
      const { stream, streamer } = streamerWith(inertHandle());

      const result = await new StreamContainerLogs(streamer).execute({ container, tail: 200 });

      expect(result.kind).toBe('refusal');
      expect(result.kind === 'refusal' && result.reason).toContain('invalid container name');
      expect(stream).not.toHaveBeenCalled();
    }
  );
});

describe('StreamContainerLogs — tail validation is the command boundary', () => {
  // The tail interpolates into the remote command like the name does, so it
  // is bounded at the same gate BEFORE the port is touched: docker itself
  // caps --tail at 10000 (all lines), and nothing below 1 line is a stream.
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001])(
    'refuses the out-of-bounds tail %j without touching the port',
    async tail => {
      const { stream, streamer } = streamerWith(inertHandle());

      const result = await new StreamContainerLogs(streamer).execute({ container: 'web-1', tail });

      expect(result.kind).toBe('refusal');
      expect(result.kind === 'refusal' && result.reason).toContain('invalid tail');
      expect(stream).not.toHaveBeenCalled();
    }
  );

  it.each([1, 10_000])('accepts the boundary tail %s and passes it through', async tail => {
    const { stream, streamer } = streamerWith(inertHandle());

    const result = await new StreamContainerLogs(streamer).execute({ container: 'web-1', tail });

    expect(result.kind).toBe('ok');
    expect(stream).toHaveBeenCalledWith({ container: 'web-1', tail });
  });
});

describe('StreamContainerLogs — delegation and transport mapping', () => {
  it('returns the port handle untouched on a valid name', async () => {
    const handle = inertHandle();
    const { streamer } = streamerWith(handle);

    const result = await new StreamContainerLogs(streamer).execute({ container: 'web-1', tail: 50 });

    expect(result).toEqual({ kind: 'ok', stream: handle });
  });

  it('maps a port rejection (acquisition failure) to a refusal carrying the reason', async () => {
    const stream = vi.fn(async () => {
      throw new Error('ssh channel open failed');
    });

    const result = await new StreamContainerLogs({ stream } as ContainerLogStreamer).execute({
      container: 'web-1',
      tail: 200,
    });

    expect(result).toEqual({ kind: 'refusal', reason: 'ssh channel open failed' });
  });
});
