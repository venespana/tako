// StreamStackLogs.test.ts — use case contract (T1-cli-logs): a stack name
// failing the domain grammar is REFUSED before anything runs (the name is
// the one piece of caller input in the remote command), a valid name
// delegates to the port exactly once with the follow flag intact, and a
// port rejection (acquisition failure) maps to a refusal object — an
// expected outcome never throws.
import { describe, expect, it, vi } from 'vitest';

import { StreamStackLogs } from './StreamStackLogs.js';
import type { StackLogStreamHandle, StackLogStreamer } from './StreamStackLogs.js';

const inertHandle = (): StackLogStreamHandle => ({
  lines: {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ value: undefined, done: true }),
    }),
  },
  stop: async () => {},
  done: Promise.resolve('ended'),
});

function streamerWith(handle: StackLogStreamHandle): {
  stream: ReturnType<typeof vi.fn>;
  streamer: StackLogStreamer;
} {
  const stream = vi.fn(async () => handle);

  return { stream, streamer: { stream } as StackLogStreamer };
}

describe('StreamStackLogs — name validation is the domain gate', () => {
  it.each(['web', 'media-stack', 'kuma_2'])('accepts the compose-safe stack %s and delegates once', async stack => {
    const { stream, streamer } = streamerWith(inertHandle());

    const result = await new StreamStackLogs(streamer).execute({ stack, follow: false });

    expect(result.kind).toBe('ok');
    expect(stream).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledWith({ stack, follow: false });
  });

  it.each(['', '-lead', 'we b', 'web;rm', 'web$x'])(
    'refuses the unsafe stack name %j without touching the port',
    async stack => {
      const { stream, streamer } = streamerWith(inertHandle());

      const result = await new StreamStackLogs(streamer).execute({ stack, follow: false });

      expect(result.kind).toBe('refusal');
      expect(result.kind === 'refusal' && result.reason).toContain('invalid stack name');
      expect(stream).not.toHaveBeenCalled();
    }
  );
});

describe('StreamStackLogs — follow flag flows through untouched', () => {
  it.each([false, true])('passes follow=%s to the port on a valid stack', async follow => {
    const { stream, streamer } = streamerWith(inertHandle());

    const result = await new StreamStackLogs(streamer).execute({ stack: 'media', follow });

    expect(result.kind).toBe('ok');
    expect(stream).toHaveBeenCalledWith({ stack: 'media', follow });
  });
});

describe('StreamStackLogs — delegation and transport mapping', () => {
  it('returns the port handle untouched on a valid stack', async () => {
    const handle = inertHandle();
    const { streamer } = streamerWith(handle);

    const result = await new StreamStackLogs(streamer).execute({ stack: 'media', follow: true });

    expect(result).toEqual({ kind: 'ok', stream: handle });
  });

  it('maps a port rejection (acquisition failure) to a refusal carrying the reason', async () => {
    const stream = vi.fn(async () => {
      throw new Error('ssh channel open failed');
    });

    const result = await new StreamStackLogs({ stream } as StackLogStreamer).execute({
      stack: 'media',
      follow: false,
    });

    expect(result).toEqual({ kind: 'refusal', reason: 'ssh channel open failed' });
  });
});
