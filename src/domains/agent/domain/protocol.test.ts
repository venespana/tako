// domain/protocol.test.ts — STRICT TDD RED phase (task 3.5)
import { describe, it, expect } from 'vitest';
// RED: import the module that doesn't exist yet
import {
  PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
  encodeFrame,
  decodeFrame,
  helloFrame,
  helloAckFrame,
  requestFrame,
  responseFrame,
  eventFrame,
  errorFrame,
  protocolWarningFrame,
  ProtocolFrameError,
} from './protocol.js';
import type { AgentFrame } from './protocol.js';
import type { JobDefinition, RunView } from './types.js';

const pruneJob: JobDefinition = {
  id: 'nas-prune',
  type: 'prune',
  scopes: ['stopped-containers'],
  schedule: { kind: 'cron', expr: '0 3 * * *' },
};

function sampleRun(overrides: Partial<RunView> = {}): RunView {
  return {
    seq: 1,
    id: 'run-1',
    jobId: 'nas-prune',
    mode: 'apply',
    status: 'succeeded',
    catchup: false,
    startedAt: '2026-09-18T03:00:00.000Z',
    finishedAt: '2026-09-18T03:00:05.000Z',
    result: { removed: 3 },
    ...overrides,
  };
}

describe('protocol constants', () => {
  it('3.5 RED: PROTOCOL_VERSION is 1 and frames carry it', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    const frame = helloFrame('1.0.0');
    expect(frame.v).toBe(1);
  });

  it('3.5 RED: MAX_FRAME_BYTES is 1 MiB', () => {
    expect(MAX_FRAME_BYTES).toBe(1_048_576);
  });
});

describe('codec roundtrip', () => {
  it('3.5 RED: encode → decode preserves a hello frame', () => {
    const frame = helloFrame('0.1.2', ['jobs']);
    const decoded = decodeFrame(encodeFrame(frame));
    expect(decoded).toEqual(frame);
    expect(decoded.kind).toBe('hello');
  });

  it('3.5 RED: encode → decode preserves a request with payload and correlation id', () => {
    const frame = requestFrame('c1', 'jobs.upsert', pruneJob);
    const decoded = decodeFrame(encodeFrame(frame));
    expect(decoded).toEqual(frame);
    expect(decoded.id).toBe('c1');
    expect(decoded.type).toBe('jobs.upsert');
    expect((decoded.payload as JobDefinition).id).toBe('nas-prune');
  });

  it('3.5 RED: encode → decode preserves every frame kind', () => {
    const frames: AgentFrame[] = [
      helloFrame('0.1.2'),
      helloAckFrame('0.1.2', 'start-1'),
      requestFrame('c2', 'jobs.list', {}),
      responseFrame('c2', 'jobs.list', { jobs: [] }),
      eventFrame('run.completed', { jobId: 'nas-prune', runId: 'run-1', status: 'succeeded', result: {} }),
      errorFrame('unknown_type', 'no such request', 'c9'),
    ];
    for (const frame of frames) {
      expect(decodeFrame(encodeFrame(frame))).toEqual(frame);
    }
  });

  it('3.5 RED: encoded frames are single-line JSON (no embedded raw newlines)', () => {
    const line = encodeFrame(eventFrame('job.state_changed', { jobId: 'a', runId: 'r', from: 'pending', to: 'running', at: 'x' }));
    expect(line).not.toContain('\n');
    expect(() => JSON.parse(line)).not.toThrow();
  });

  it('3.5 RED: decode accepts a frame without optional fields (id/payload)', () => {
    const decoded = decodeFrame('{"v":1,"kind":"event","type":"protocol.warning"}');
    expect(decoded.v).toBe(1);
    expect(decoded.id).toBeUndefined();
    expect(decoded.payload).toBeUndefined();
  });
});

describe('oversized frame rejection', () => {
  it('3.5 RED: encodeFrame rejects payloads beyond 1 MiB', () => {
    const hugeJob: JobDefinition = { ...pruneJob, id: 'huge', type: 'stack-lifecycle', op: 'up', stackDir: 'x'.repeat(MAX_FRAME_BYTES) } as JobDefinition;
    const frame = requestFrame('c1', 'jobs.upsert', hugeJob);
    expect(() => encodeFrame(frame)).toThrow(ProtocolFrameError);
    try {
      encodeFrame(frame);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ProtocolFrameError).code).toBe('too_large');
    }
  });

  it('3.5 RED: decodeFrame rejects oversized lines', () => {
    const bigLine = `{"v":1,"kind":"event","type":"protocol.warning","payload":{"blob":"${'x'.repeat(MAX_FRAME_BYTES)}"}}`;
    expect(() => decodeFrame(bigLine)).toThrow(ProtocolFrameError);
    expect(((): string => { try { decodeFrame(bigLine); } catch (e) { return (e as ProtocolFrameError).code; } return ''; })()).toBe('too_large');
  });
});

describe('frame validation (unknown / malformed)', () => {
  it('3.5 RED: invalid JSON is a protocol error', () => {
    expect(() => decodeFrame('not json at all')).toThrow(ProtocolFrameError);
    expect(errorCodeFor('{')).toBe('bad_json');
  });

  it('3.5 RED: wrong protocol major version is a version error (never silently accepted)', () => {
    expect(errorCodeFor('{"v":2,"kind":"hello","type":"x"}')).toBe('version');
    expect(errorCodeFor('{"kind":"hello","type":"x"}')).toBe('version');
  });

  it('3.5 RED: unknown frame kind is rejected', () => {
    expect(errorCodeFor('{"v":1,"kind":"broadcast","type":"agent.status"}')).toBe('kind');
  });

  it('3.5 RED: non-dotted message type is rejected', () => {
    expect(errorCodeFor('{"v":1,"kind":"request","type":"jobs"}')).toBe('type');
    expect(errorCodeFor('{"v":1,"kind":"request","type":"UPPER.CASE"}')).toBe('type');
    expect(errorCodeFor('{"v":1,"kind":"request"}')).toBe('type'); // missing type
  });

  it('3.5 RED: non-object frames and non-string ids are rejected', () => {
    expect(errorCodeFor('"hello"')).toBe('shape');
    expect(errorCodeFor('42')).toBe('shape');
    expect(errorCodeFor('{"v":1,"kind":"request","type":"a.b","id":42}')).toBe('shape');
  });

  it('3.5 RED: ProtocolFrameError carries the code and never leaks without one', () => {
    try {
      decodeFrame('garbage');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolFrameError);
      expect(typeof (error as ProtocolFrameError).code).toBe('string');
    }
  });
});

describe('factories and handshake types', () => {
  it('3.5 RED: helloFrame advertises client version, protocol and caps', () => {
    const frame = helloFrame('0.1.2');
    expect(frame.kind).toBe('hello');
    expect(frame.payload).toEqual({ clientVersion: '0.1.2', protocol: 1, caps: ['jobs'] });
  });

  it('3.5 RED: helloAckFrame advertises agent version, protocol and start id', () => {
    const frame = helloAckFrame('0.1.2', 'start-42');
    expect(frame.kind).toBe('hello_ack');
    expect(frame.payload).toEqual({ agentVersion: '0.1.2', protocol: 1, agentStartId: 'start-42' });
  });

  it('3.5 RED: requestFrame carries a client correlation id (c prefix convention)', () => {
    const frame = requestFrame('c1', 'agent.status', {});
    expect(frame.id).toBe('c1');
    expect(frame.kind).toBe('request');
  });

  it('3.5 RED: responseFrame references the request correlation id', () => {
    const frame = responseFrame('c1', 'agent.status', { agentVersion: 'x', protocol: 1, uptimeSec: 1, jobCount: 0, unitState: 'active', linger: false, lingerByTako: false });
    expect(frame.id).toBe('c1');
    expect(frame.kind).toBe('response');
  });

  it('3.5 RED: eventFrame has no correlation id (push, not reply)', () => {
    const frame = eventFrame('job.state_changed', { jobId: 'nas-prune', runId: 'run-1', from: 'pending', to: 'running', at: 't' });
    expect(frame.id).toBeUndefined();
    expect(frame.kind).toBe('event');
    expect(frame.type).toBe('job.state_changed');
  });

  it('3.5 RED: errorFrame carries code, message and optional correlation', () => {
    const frame = errorFrame('invalid_payload', 'jobId is required', 'c7');
    expect(frame.kind).toBe('error');
    expect(frame.payload).toEqual({ code: 'invalid_payload', message: 'jobId is required', correlation: 'c7' });
  });

  it('3.5 RED: protocolWarningFrame carries both versions and detail, session continues', () => {
    const frame = protocolWarningFrame({ clientVersion: '0.2.0', agentVersion: '0.1.2', detail: 'client newer than agent' });
    expect(frame.type).toBe('protocol.warning');
    expect(frame.kind).toBe('event');
  });
});

// --- helpers -----------------------------------------------------------------

function errorCodeFor(line: string): string {
  try {
    decodeFrame(line);
  } catch (error) {
    if (error instanceof ProtocolFrameError) return error.code;
    throw error;
  }
  throw new Error('expected decodeFrame to throw');
}
