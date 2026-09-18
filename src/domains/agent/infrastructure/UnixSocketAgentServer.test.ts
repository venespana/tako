// infrastructure/UnixSocketAgentServer.test.ts — STRICT TDD RED phase
//
// node:net server serving the WU3 protocol over ~/.tako/agent.sock (task 4.3):
// 0600 socket, stale-socket recovery, crash recovery pre-serve, request
// routing to the WU3 use cases, push events. Real sockets, in-memory store.
import { connect as netConnect, createServer as createNetServer } from 'node:net';
import { mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  helloFrame,
  requestFrame,
  type AgentFrame,
} from '../domain/protocol.js';
import type { JobDefinition } from '../domain/types.js';
import { InMemoryJobStore } from '../testing/InMemoryJobStore.js';
import { UnixSocketAgentServer } from './UnixSocketAgentServer.js';

interface TestClient {
  send(frame: AgentFrame): void;
  nextFrame(): Promise<AgentFrame>;
  raw(): Promise<string[]>;
  close(): Promise<void>;
}

function connectClient(socketPath: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket = netConnect(socketPath);
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    const lines: string[] = [];
    const waiters: Array<(frame: AgentFrame) => void> = [];

    socket.on('connect', () => {
      resolve({
        send(frame) {
          socket.write(JSON.stringify(frame) + '\n');
        },
        nextFrame() {
          const existing = lines.shift();
          if (existing !== undefined) return Promise.resolve(JSON.parse(existing) as AgentFrame);
          return new Promise(resolveFrame => waiters.push(resolveFrame));
        },
        async raw() {
          return [...lines];
        },
        close() {
          return new Promise(resolveClose => socket.end(() => resolveClose()));
        },
      });
    });
    socket.on('data', chunk => {
      buffer += decoder.write(chunk as Buffer);
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        const waiter = waiters.shift();
        if (waiter !== undefined) {
          waiter(JSON.parse(line) as AgentFrame);
        } else {
          lines.push(line);
        }
        index = buffer.indexOf('\n');
      }
    });
    socket.on('error', reject);
  });
}

const PRUNE_JOB: JobDefinition = {
  id: 'nas-prune',
  type: 'prune',
  scopes: ['dangling-images'],
  schedule: { kind: 'cron', expr: '0 4 * * *' },
};

function createServer(socketPath: string, store = new InMemoryJobStore()): UnixSocketAgentServer {
  return new UnixSocketAgentServer({
    socketPath,
    agentVersion: '0.1.2',
    store,
    clock: { now: () => new Date('2026-01-01T00:00:00.000Z') },
    status: async () => ({ unitState: 'active', linger: true, lingerByTako: false }),
  });
}

describe('UnixSocketAgentServer — socket setup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tako-server-'));
  const socketPath = join(dir, 'agent.sock');

  afterEach(() => {
    rmSync(socketPath, { force: true });
  });

  it('binds the socket path with mode 0600', async () => {
    const server = createServer(socketPath);
    await server.start();

    const mode = statSync(socketPath).mode & 0o777;
    expect(mode.toString(8)).toBe('600');
    await server.stop();
  });

  it('recovers from a stale socket file left by a crashed agent', async () => {
    // Simulate a crashed agent: while a raw server holds the socket, rename
    // the inode away, then let the server die uncleanly. The moved file is a
    // socket inode with NO listener behind it — exactly what a crash leaves.
    const stale = join(dir, 'stale.sock');
    const live = `${stale}.live`;
    await new Promise<void>(resolve => {
      const crashed = createNetServer(socket => socket.destroy());
      crashed.listen(live, () => {
        renameSync(live, stale);
        crashed.close(() => resolve());
      });
    });
    expect(() => statSync(stale)).not.toThrow();

    const server = createServer(stale);
    await expect(server.start()).resolves.toBeUndefined();
    const client = await connectClient(stale);
    client.send(helloFrame('0.1.2'));
    await expect(client.nextFrame()).resolves.toMatchObject({ kind: 'hello_ack' });
    await client.close();
    await server.stop();
  });

  it('refuses to start when another live agent owns the socket', async () => {
    const holder = createServer(socketPath);
    await holder.start();

    const second = createServer(socketPath);
    await expect(second.start()).rejects.toThrow(/another agent/i);

    await holder.stop();
  });
});

describe('UnixSocketAgentServer — crash recovery before serving', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tako-server-'));
  const socketPath = join(dir, 'crash.sock');

  afterEach(() => {
    rmSync(socketPath, { force: true });
  });

  it('marks stale pending and running runs as failed before answering any request', async () => {
    const store = new InMemoryJobStore();
    await store.upsertJob(PRUNE_JOB);
    const staleRunning = await store.createRun({ jobId: 'nas-prune', mode: 'apply', catchup: false, startedAt: 'x' });
    const stalePending = await store.createRun({ jobId: 'nas-prune', mode: 'dry-run', catchup: false, startedAt: 'y' });

    const server = createServer(socketPath, store);
    await server.start();

    const recovered = await store.listRuns({});
    const byId = new Map(recovered.map(run => [run.id, run]));
    expect(byId.get(staleRunning.id)?.status).toBe('failed');
    expect(byId.get(stalePending.id)?.status).toBe('failed');
    expect(byId.get(staleRunning.id)?.finishedAt).toBeDefined();
    await server.stop();
  });
});

describe('UnixSocketAgentServer — protocol serving', () => {
  let server: UnixSocketAgentServer;
  let socketPath: string;
  let dir: string;
  let store: InMemoryJobStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tako-server-'));
    socketPath = join(dir, 'agent.sock');
    store = new InMemoryJobStore();
    await store.upsertJob(PRUNE_JOB);
    server = createServer(socketPath, store);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers hello with hello_ack carrying agentVersion, protocol, agentStartId', async () => {
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.1.2'));

    const ack = await client.nextFrame();

    expect(ack.kind).toBe('hello_ack');
    expect(ack.type).toBe('agent.hello_ack');
    const payload = ack.payload as { agentVersion: string; protocol: number; agentStartId: string };
    expect(payload.agentVersion).toBe('0.1.2');
    expect(payload.protocol).toBe(PROTOCOL_VERSION);
    expect(payload.agentStartId).toMatch(/.+/);
    await client.close();
  });

  it('pushes a protocol.warning event after hello_ack when the client version differs (never blocks)', async () => {
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.0.1'));

    const ack = await client.nextFrame();
    const warning = await client.nextFrame();

    expect(ack.kind).toBe('hello_ack');
    expect(warning.kind).toBe('event');
    expect(warning.type).toBe('protocol.warning');
    expect(warning.payload).toMatchObject({ clientVersion: '0.0.1', agentVersion: '0.1.2' });
    await client.close();
  });

  it('routes jobs.list to the store', async () => {
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.1.2'));
    await client.nextFrame();

    client.send(requestFrame('c1', 'jobs.list', {}));
    const response = await client.nextFrame();

    expect(response).toMatchObject({ id: 'c1', kind: 'response', type: 'jobs.list' });
    const payload = response.payload as { jobs: Array<{ job: JobDefinition }> };
    expect(payload.jobs).toHaveLength(1);
    expect(payload.jobs[0]?.job.id).toBe('nas-prune');
    await client.close();
  });

  it('routes jobs.upsert through the domain guard: invalid definitions are rejected with invalid_payload', async () => {
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.1.2'));
    await client.nextFrame();

    client.send(
      requestFrame('c2', 'jobs.upsert', {
        id: 'bad;id',
        type: 'prune',
        scopes: ['dangling-images'],
        schedule: { kind: 'cron', expr: '0 4 * * *' },
      })
    );
    const response = await client.nextFrame();

    expect(response.kind).toBe('error');
    expect(response.payload).toMatchObject({ code: 'invalid_payload' });
    await client.close();
  });

  it('upserts valid definitions idempotently by id', async () => {
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.1.2'));
    await client.nextFrame();

    const webPull: JobDefinition = {
      id: 'web-pull',
      type: 'stack-lifecycle',
      op: 'pull',
      stackDir: '/opt/web',
      schedule: { kind: 'cron', expr: '0 3 * * *' },
    };
    client.send(requestFrame('c3', 'jobs.upsert', webPull));
    const first = await client.nextFrame();
    client.send(requestFrame('c4', 'jobs.upsert', webPull));
    const second = await client.nextFrame();

    expect(first.payload).toMatchObject({ created: true });
    expect(second.payload).toMatchObject({ created: false });
    await client.close();
  });

  it('routes jobs.delete (unknown id → deleted false) and jobs.history with agent-wide lastSeq', async () => {
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.1.2'));
    await client.nextFrame();

    client.send(requestFrame('c5', 'jobs.delete', { jobId: 'nope' }));
    const deleted = await client.nextFrame();
    expect(deleted.payload).toEqual({ deleted: false });

    await store.createRun({ jobId: 'nas-prune', mode: 'apply', catchup: false, startedAt: 't' });
    client.send(requestFrame('c6', 'jobs.history', { jobId: 'nas-prune' }));
    const history = await client.nextFrame();
    expect(history.payload).toMatchObject({ lastSeq: 1 });
    const payload = history.payload as { runs: Array<{ jobId: string }> };
    expect(payload.runs).toHaveLength(1);
    await client.close();
  });

  it('jobs.trigger for an unknown job answers an error, not a crash', async () => {
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.1.2'));
    await client.nextFrame();

    client.send(requestFrame('c7', 'jobs.trigger', { jobId: 'nope', mode: 'apply' }));
    const response = await client.nextFrame();

    expect(response.kind).toBe('error');
    expect(response.payload).toMatchObject({ code: 'invalid_payload', correlation: 'c7' });
    await client.close();
  });

  it('routes reconcile.sync returning full jobs and runs newer than the cursor', async () => {
    await store.createRun({ jobId: 'nas-prune', mode: 'apply', catchup: false, startedAt: 't1' });
    await store.createRun({ jobId: 'nas-prune', mode: 'dry-run', catchup: false, startedAt: 't2' });
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.1.2'));
    await client.nextFrame();

    client.send(requestFrame('c8', 'reconcile.sync', { lastSeq: 1 }));
    const response = await client.nextFrame();

    const payload = response.payload as { jobs: unknown[]; runs: Array<{ seq: number }>; lastSeq: number };
    expect(payload.jobs).toHaveLength(1);
    expect(payload.runs.map(run => run.seq)).toEqual([2]);
    expect(payload.lastSeq).toBe(2);
    await client.close();
  });

  it('routes agent.status merging the host status provider with job count and uptime', async () => {
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.1.2'));
    await client.nextFrame();

    client.send(requestFrame('c9', 'agent.status', {}));
    const response = await client.nextFrame();

    const payload = response.payload as {
      agentVersion: string;
      protocol: number;
      jobCount: number;
      unitState: string;
      linger: boolean;
      lingerByTako: boolean;
      uptimeSec: number;
    };
    expect(payload).toMatchObject({
      agentVersion: '0.1.2',
      protocol: PROTOCOL_VERSION,
      jobCount: 1,
      unitState: 'active',
      linger: true,
      lingerByTako: false,
    });
    expect(payload.uptimeSec).toBeGreaterThanOrEqual(0);
    await client.close();
  });

  it('answers unknown request types with unknown_type and a corrupt frame with invalid_payload', async () => {
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.1.2'));
    await client.nextFrame();

    client.send(requestFrame('c10', 'jobs.destroy' as 'jobs.list', {}));
    const unknown = await client.nextFrame();
    expect(unknown.kind).toBe('error');
    expect(unknown.payload).toMatchObject({ code: 'unknown_type' });

    client.send({ v: 1, kind: 'not-a-kind', type: 'x.y' } as unknown as AgentFrame);
    const corrupt = await client.nextFrame();
    expect(corrupt.kind).toBe('error');
    expect(corrupt.payload).toMatchObject({ code: 'invalid_payload' });
    await client.close();
  });

  it('rejects request frames sent before the handshake', async () => {
    const client = await connectClient(socketPath);

    client.send(requestFrame('c11', 'jobs.list', {}));
    const response = await client.nextFrame();

    expect(response.kind).toBe('error');
    expect(response.payload).toMatchObject({ code: 'invalid_payload' });
    await client.close();
  });

  it('broadcastEvent reaches every connected client', async () => {
    const one = await connectClient(socketPath);
    const two = await connectClient(socketPath);
    one.send(helloFrame('0.1.2'));
    two.send(helloFrame('0.1.2'));
    await one.nextFrame();
    await two.nextFrame();

    server.broadcastEvent({
      v: PROTOCOL_VERSION,
      kind: 'event',
      type: 'run.completed',
      payload: { runId: 'r9' },
    });

    await expect(one.nextFrame()).resolves.toMatchObject({ kind: 'event', type: 'run.completed' });
    await expect(two.nextFrame()).resolves.toMatchObject({ kind: 'event', type: 'run.completed' });
    await one.close();
    await two.close();
  });

  it('stop() unlinks the socket file so the next start binds cleanly', async () => {
    await server.stop();
    const restarted = createServer(socketPath, store);
    await expect(restarted.start()).resolves.toBeUndefined();
    await restarted.stop();
  });
});

describe('UnixSocketAgentServer — oversized frames', () => {
  it('answers an oversized frame with an invalid_payload error instead of crashing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tako-server-'));
    const socketPath = join(dir, 'big.sock');
    const server = createServer(socketPath);
    await server.start();
    const client = await connectClient(socketPath);
    client.send(helloFrame('0.1.2'));
    await client.nextFrame();

    const giant = 'x'.repeat(1_048_577);
    client.send({ v: PROTOCOL_VERSION, kind: 'request', id: 'big', type: 'jobs.list', payload: { giant } } as unknown as AgentFrame);
    const response = await client.nextFrame();

    expect(response.kind).toBe('error');
    expect(response.payload).toMatchObject({ code: 'invalid_payload', correlation: 'big' });
    await client.close();
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  });
});
