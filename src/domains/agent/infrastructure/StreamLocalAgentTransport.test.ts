// infrastructure/StreamLocalAgentTransport.test.ts — STRICT TDD RED phase
//
// Client-side AgentTransport over the remotes AgentChannel port (task 4.4):
// handshake, correlation-ID multiplexing, push-event dispatch, cleanup.
import { Duplex } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { StreamLocalAgentTransport } from './StreamLocalAgentTransport.js';
import type { AgentChannel } from '../../remotes/application/AgentChannel.js';
import { PROTOCOL_VERSION, helloAckFrame, eventFrame, errorFrame } from '../domain/protocol.js';

const CLIENT_VERSION = '0.1.2';

/**
 * Object-mode duplex fake matching the AgentChannel frame surface: writes are
 * recorded (one string frame each), tests push frames toward the "client".
 */
class FakeChannelStream extends Duplex {
  readonly writes: string[] = [];
  private draining = true;

  constructor() {
    super({ objectMode: true });
  }

  override _read(): void {
    // Frames arrive only via serverFrame().
  }

  override _write(frame: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (typeof frame !== 'string') {
      callback(new TypeError('frames must be strings'));
      return;
    }

    this.writes.push(frame);

    if (this.draining) {
      callback();
      return;
    }

    this.draining = true;
    setImmediate(callback);
  }

  /** Simulate the agent sending one protocol frame to the client. */
  serverFrame(frame: unknown): void {
    this.push(typeof frame === 'string' ? frame : JSON.stringify(frame));
  }

  /** Simulate the remote side closing the stream. */
  serverClose(): void {
    this.push(null);
  }

  override _final(callback: (error?: Error | null) => void): void {
    callback();
  }
}

function createTransport(
  ack: Parameters<typeof helloAckFrame>[0] | 'error' | 'garbage',
  version = CLIENT_VERSION
): {
  transport: StreamLocalAgentTransport;
  stream: FakeChannelStream;
} {
  const stream = new FakeChannelStream();
  const channel: AgentChannel = {
    open: vi.fn(async () => stream),
    close: vi.fn(async () => undefined),
  };
  const transport = new StreamLocalAgentTransport({ channel, clientVersion: version, requestTimeoutMs: 250 });
  queueMicrotask(() => {
    if (ack === 'error') {
      stream.serverFrame(errorFrame('internal', 'boom'));
    } else if (ack === 'garbage') {
      stream.serverFrame('not-json');
    } else {
      stream.serverFrame(helloAckFrame(ack, 'start-1'));
    }
  });
  return { transport, stream };
}

describe('StreamLocalAgentTransport — handshake', () => {
  it('sends hello and resolves the session once hello_ack arrives (matching versions → no warning)', async () => {
    const { transport, stream } = createTransport(CLIENT_VERSION);

    const session = await transport.connect();

    expect(stream.writes[0]).toBeDefined();
    const hello = JSON.parse(stream.writes[0] ?? '{}') as {
      kind: string;
      type: string;
      payload: { protocol: number; clientVersion: string };
    };
    expect(hello.kind).toBe('hello');
    expect(hello.payload.protocol).toBe(PROTOCOL_VERSION);
    expect(hello.payload.clientVersion).toBe(CLIENT_VERSION);
    expect(session.handshake.warning).toBeUndefined();
    expect(session.handshake.ack.agentVersion).toBe(CLIENT_VERSION);
    expect(session.handshake.ack.agentStartId).toBe('start-1');
    await session.close();
  });

  it('exposes a warning (session continues) when the agent version differs from the client', async () => {
    const { transport } = createTransport('9.9.9');

    const session = await transport.connect();

    expect(session.handshake.warning).toBeDefined();
    expect(session.handshake.warning?.clientVersion).toBe(CLIENT_VERSION);
    expect(session.handshake.warning?.agentVersion).toBe('9.9.9');
    await session.close();
  });

  it('exposes a warning when the agent protocol major differs', async () => {
    const stream = new FakeChannelStream();
    const channel: AgentChannel = { open: vi.fn(async () => stream), close: vi.fn(async () => undefined) };
    const transport = new StreamLocalAgentTransport({ channel, clientVersion: CLIENT_VERSION });
    queueMicrotask(() => {
      stream.serverFrame({
        v: PROTOCOL_VERSION,
        kind: 'hello_ack',
        type: 'agent.hello_ack',
        payload: { agentVersion: CLIENT_VERSION, protocol: PROTOCOL_VERSION + 1, agentStartId: 'start-1' },
      });
    });

    const session = await transport.connect();

    expect(session.handshake.warning?.detail).toMatch(/protocol/i);
    await session.close();
  });

  it('fails the connect when the agent answers with an error frame instead of hello_ack', async () => {
    const { transport } = createTransport('error');

    await expect(transport.connect()).rejects.toThrow(/boom/);
  });

  it('fails the connect when the first inbound frame is not valid JSON', async () => {
    const { transport } = createTransport('garbage');

    await expect(transport.connect()).rejects.toThrow();
  });
});

describe('StreamLocalAgentTransport — request multiplexing', () => {
  it('correlates responses to concurrent requests by id, even out of order', async () => {
    const stream = new FakeChannelStream();
    const channel: AgentChannel = { open: vi.fn(async () => stream), close: vi.fn(async () => undefined) };
    const transport = new StreamLocalAgentTransport({ channel, clientVersion: CLIENT_VERSION });
    queueMicrotask(() => stream.serverFrame(helloAckFrame(CLIENT_VERSION, 'start-1')));
    const session = await transport.connect();

    const first = session.request('jobs.list', {});
    const second = session.request('jobs.delete', { jobId: 'nas-prune' });

    // Respond to the SECOND request first — correlation must not be positional.
    const firstFrame = JSON.parse(stream.writes[1] ?? '{}') as { id?: string };
    const secondFrame = JSON.parse(stream.writes[2] ?? '{}') as { id?: string };
    stream.serverFrame({
      v: PROTOCOL_VERSION,
      id: secondFrame.id,
      kind: 'response',
      type: 'jobs.delete',
      payload: { deleted: true },
    });
    stream.serverFrame({
      v: PROTOCOL_VERSION,
      id: firstFrame.id,
      kind: 'response',
      type: 'jobs.list',
      payload: { jobs: [] },
    });

    await expect(second).resolves.toEqual({ deleted: true });
    await expect(first).resolves.toEqual({ jobs: [] });
    await session.close();
  });

  it('rejects a request when the agent answers with an error frame referencing the correlation id', async () => {
    const stream = new FakeChannelStream();
    const channel: AgentChannel = { open: vi.fn(async () => stream), close: vi.fn(async () => undefined) };
    const transport = new StreamLocalAgentTransport({ channel, clientVersion: CLIENT_VERSION });
    queueMicrotask(() => stream.serverFrame(helloAckFrame(CLIENT_VERSION, 'start-1')));
    const session = await transport.connect();

    const pending = session.request('jobs.list', {});
    const frame = JSON.parse(stream.writes[1] ?? '{}') as { id?: string };
    queueMicrotask(() => stream.serverFrame(errorFrame('internal', 'kaboom', frame.id)));

    await expect(pending).rejects.toThrow(/kaboom/);
    await session.close();
  });

  it('times a request out instead of hanging forever', async () => {
    const stream = new FakeChannelStream();
    const channel: AgentChannel = { open: vi.fn(async () => stream), close: vi.fn(async () => undefined) };
    const transport = new StreamLocalAgentTransport({ channel, clientVersion: CLIENT_VERSION, requestTimeoutMs: 20 });
    queueMicrotask(() => stream.serverFrame(helloAckFrame(CLIENT_VERSION, 'start-1')));
    const session = await transport.connect();

    await expect(session.request('jobs.list', {})).rejects.toThrow(/timed out/i);
    await session.close();
  });
});

describe('StreamLocalAgentTransport — push events and teardown', () => {
  it('dispatches push events to onEvent listeners; unsubscribing stops delivery', async () => {
    const stream = new FakeChannelStream();
    const channel: AgentChannel = { open: vi.fn(async () => stream), close: vi.fn(async () => undefined) };
    const transport = new StreamLocalAgentTransport({ channel, clientVersion: CLIENT_VERSION });
    queueMicrotask(() => stream.serverFrame(helloAckFrame(CLIENT_VERSION, 'start-1')));
    const session = await transport.connect();

    const seen: string[] = [];
    const unsubscribe = session.onEvent(frame => seen.push(frame.type));
    stream.serverFrame(eventFrame('run.completed', { runId: 'r1' }));
    unsubscribe();
    stream.serverFrame(eventFrame('job.state_changed', { runId: 'r2' }));
    await new Promise(resolve => setImmediate(resolve));

    expect(seen).toEqual(['run.completed']);
    await session.close();
  });

  it('rejects every pending request and closes the stream when the session closes', async () => {
    const stream = new FakeChannelStream();
    const channel: AgentChannel = { open: vi.fn(async () => stream), close: vi.fn(async () => undefined) };
    const transport = new StreamLocalAgentTransport({ channel, clientVersion: CLIENT_VERSION });
    queueMicrotask(() => stream.serverFrame(helloAckFrame(CLIENT_VERSION, 'start-1')));
    const session = await transport.connect();

    const pending = session.request('jobs.list', {});
    await session.close();

    await expect(pending).rejects.toThrow(/closed/i);
  });

  it('rejects pending requests when the remote side drops the stream mid-session', async () => {
    const stream = new FakeChannelStream();
    const channel: AgentChannel = { open: vi.fn(async () => stream), close: vi.fn(async () => undefined) };
    const transport = new StreamLocalAgentTransport({ channel, clientVersion: CLIENT_VERSION });
    queueMicrotask(() => stream.serverFrame(helloAckFrame(CLIENT_VERSION, 'start-1')));
    const session = await transport.connect();

    const pending = session.request('jobs.list', {});
    stream.serverClose();

    await expect(pending).rejects.toThrow(/closed|dropped/i);
    await session.close();
  });

  it('rejects requests issued after the session was closed', async () => {
    const stream = new FakeChannelStream();
    const channel: AgentChannel = { open: vi.fn(async () => stream), close: vi.fn(async () => undefined) };
    const transport = new StreamLocalAgentTransport({ channel, clientVersion: CLIENT_VERSION });
    queueMicrotask(() => stream.serverFrame(helloAckFrame(CLIENT_VERSION, 'start-1')));
    const session = await transport.connect();

    await session.close();

    await expect(session.request('jobs.list', {})).rejects.toThrow(/closed/i);
  });
});
