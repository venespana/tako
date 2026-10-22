// domain/protocol.ts — agent protocol frames, codec, handshake, request table (task 3.5)
//
// Pure module — NO node:net, NO I/O. Shared by the client transport adapter
// (WU4) and the agent socket server: both sides encode/decode the exact same
// frames. Framing per design §Protocol: newline-delimited UTF-8 JSON, one
// frame per line, max frame 1 MiB (beyond that is a protocol error).
//
// The `encodeFrame`/`decodeFrame` pair deliberately excludes the newline
// delimiter: the AgentChannel port (remotes/application) appends it on write
// and strips it on read, so the codec only ever sees one complete frame.

import type { JobDefinition, JobView, RunMode, RunView, Slug, TerminalRunStatus, RunStatus } from './types.js';

/** Protocol major version; carried in every frame's `v`. */
export const PROTOCOL_VERSION = 1;

/** Maximum encoded frame size in bytes; anything larger is a protocol error. */
export const MAX_FRAME_BYTES = 1_048_576;

/** Frame kinds (design §Protocol). */
export type FrameKind = 'hello' | 'hello_ack' | 'request' | 'response' | 'event' | 'error';

/** Wire shape of every message on the agent channel. */
export interface AgentFrame<P = unknown> {
  /** Protocol major version — must equal {@link PROTOCOL_VERSION}. */
  readonly v: typeof PROTOCOL_VERSION;
  /** Correlation id: 'c<n>' client-initiated / 'a<n>' agent-initiated. Absent on events. */
  readonly id?: string;
  readonly kind: FrameKind;
  /** Dotted message name (e.g. 'agent.status', 'job.state_changed'). */
  readonly type: string;
  readonly payload?: P;
}

/** Dotted message names must be lowercase with at least one dot separator. */
const DOTTED_TYPE_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

/** Machine-readable error codes for `error` frames (design §Protocol). */
export type ProtocolErrorCode = 'unknown_type' | 'invalid_payload' | 'busy' | 'internal';

export interface ProtocolErrorPayload {
  readonly code: ProtocolErrorCode;
  readonly message: string;
  /** Request id this error answers, when applicable. */
  readonly correlation?: string;
}

/** Thrown by the codec for any frame that cannot be encoded or trusted. */
export class ProtocolFrameError extends Error {
  readonly code: 'bad_json' | 'version' | 'kind' | 'type' | 'shape' | 'too_large';

  constructor(code: ProtocolFrameError['code'], message: string) {
    super(message);
    this.name = 'ProtocolFrameError';
    this.code = code;
  }
}

// --- Handshake (first two frames on every channel) ---------------------------

/** Payload of the client's `hello` frame. */
export interface HelloPayload {
  readonly clientVersion: string;
  readonly protocol: number;
  readonly caps: readonly string[];
}

/** Payload of the agent's `hello_ack` frame. */
export interface HelloAckPayload {
  readonly agentVersion: string;
  readonly protocol: number;
  /** Identifier of the agent process start (restarts change it). */
  readonly agentStartId: string;
}

/** Pushed on version/protocol mismatch; the session continues (never blocks). */
export interface ProtocolWarningPayload {
  readonly clientVersion: string;
  readonly agentVersion: string;
  readonly detail: string;
}

// --- Request table (design §Protocol) ----------------------------------------

export interface AgentStatusResult {
  readonly agentVersion: string;
  readonly protocol: number;
  readonly uptimeSec: number;
  readonly jobCount: number;
  /** Raw systemd unit state ('active', 'inactive', 'not-found', …). */
  readonly unitState: string;
  readonly linger: boolean;
  /** Whether TAKO enabled linger on this server (D8: agent_meta is authoritative). */
  readonly lingerByTako: boolean;
}

/** Typed request/response mapping for every v0 client→agent request. */
export interface AgentRequestMap {
  'agent.status': { readonly request: Record<string, never>; readonly response: AgentStatusResult };
  'jobs.list': { readonly request: Record<string, never>; readonly response: { readonly jobs: JobView[] } };
  'jobs.upsert': {
    readonly request: JobDefinition;
    readonly response: { readonly job: JobView; readonly created: boolean };
  };
  'jobs.delete': { readonly request: { readonly jobId: Slug }; readonly response: { readonly deleted: boolean } };
  'jobs.trigger': {
    readonly request: { readonly jobId: Slug; readonly mode: RunMode };
    readonly response: { readonly run: RunView };
  };
  'jobs.history': {
    readonly request: { readonly jobId?: Slug; readonly sinceSeq?: number; readonly limit?: number };
    readonly response: { readonly runs: RunView[]; readonly lastSeq: number };
  };
  'reconcile.sync': {
    readonly request: { readonly lastSeq: number };
    readonly response: { readonly jobs: JobView[]; readonly runs: RunView[]; readonly lastSeq: number };
  };
}

export type AgentRequestType = keyof AgentRequestMap;

/** Push event types (no correlation id — not tied to any request). */
export type AgentEventType = 'job.state_changed' | 'run.completed' | 'protocol.warning';

export interface JobStateChangedPayload {
  readonly jobId: Slug;
  readonly runId: string;
  readonly from: RunStatus;
  readonly to: RunStatus;
  readonly at: string;
}

export interface RunCompletedPayload {
  readonly jobId: Slug;
  readonly runId: string;
  readonly status: TerminalRunStatus;
  readonly result?: unknown;
}

// --- Codec -------------------------------------------------------------------

/** Encode one frame to its single-line JSON form (no trailing newline). */
export function encodeFrame(frame: AgentFrame): string {
  const line = JSON.stringify(frame);

  if (Buffer.byteLength(line, 'utf8') > MAX_FRAME_BYTES) {
    throw new ProtocolFrameError('too_large', `frame exceeds ${MAX_FRAME_BYTES} bytes`);
  }

  return line;
}

/** Decode and validate one frame line (no trailing newline). */
export function decodeFrame(line: string): AgentFrame {
  if (Buffer.byteLength(line, 'utf8') > MAX_FRAME_BYTES) {
    throw new ProtocolFrameError('too_large', `frame exceeds ${MAX_FRAME_BYTES} bytes`);
  }

  let raw: unknown;

  try {
    raw = JSON.parse(line);
  } catch {
    throw new ProtocolFrameError('bad_json', 'frame is not valid JSON');
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ProtocolFrameError('shape', 'frame must be a JSON object');
  }

  const candidate = raw as Record<string, unknown>;

  if (candidate['v'] !== PROTOCOL_VERSION) {
    throw new ProtocolFrameError('version', `unsupported protocol version ${JSON.stringify(candidate['v'] ?? null)}`);
  }

  const kind = candidate['kind'];

  if (typeof kind !== 'string' || !isFrameKind(kind)) {
    throw new ProtocolFrameError('kind', `unknown frame kind ${JSON.stringify(kind ?? null)}`);
  }

  const type = candidate['type'];

  if (typeof type !== 'string' || !DOTTED_TYPE_PATTERN.test(type)) {
    throw new ProtocolFrameError(
      'type',
      `message type must be a dotted lowercase name, got ${JSON.stringify(type ?? null)}`
    );
  }

  if (candidate['id'] !== undefined && typeof candidate['id'] !== 'string') {
    throw new ProtocolFrameError('shape', 'correlation id must be a string');
  }

  const frame: AgentFrame = {
    v: PROTOCOL_VERSION,
    kind,
    type,
    ...(candidate['id'] !== undefined && { id: candidate['id'] as string }),
    ...(candidate['payload'] !== undefined && { payload: candidate['payload'] }),
  };
  return frame;
}

function isFrameKind(value: string): value is FrameKind {
  return (
    value === 'hello' ||
    value === 'hello_ack' ||
    value === 'request' ||
    value === 'response' ||
    value === 'event' ||
    value === 'error'
  );
}

// --- Factories (keep v=1 and kind conventions consistent at construction) ----

/** Client handshake opener: advertises version and capabilities. */
export function helloFrame(clientVersion: string, caps: readonly string[] = ['jobs']): AgentFrame<HelloPayload> {
  return {
    v: PROTOCOL_VERSION,
    kind: 'hello',
    type: 'agent.hello',
    payload: { clientVersion, protocol: PROTOCOL_VERSION, caps: [...caps] },
  };
}

/** Agent handshake reply. */
export function helloAckFrame(agentVersion: string, agentStartId: string): AgentFrame<HelloAckPayload> {
  return {
    v: PROTOCOL_VERSION,
    kind: 'hello_ack',
    type: 'agent.hello_ack',
    payload: { agentVersion, protocol: PROTOCOL_VERSION, agentStartId },
  };
}

/** Client request with correlation id. */
export function requestFrame<K extends AgentRequestType>(
  id: string,
  type: K,
  payload: AgentRequestMap[K]['request']
): AgentFrame<AgentRequestMap[K]['request']> {
  return { v: PROTOCOL_VERSION, id, kind: 'request', type, payload };
}

/** Agent reply referencing the request's correlation id. */
export function responseFrame(id: string, type: AgentRequestType, payload: unknown): AgentFrame {
  return { v: PROTOCOL_VERSION, id, kind: 'response', type, payload };
}

/** Agent push event — no correlation id by design. */
export function eventFrame(type: AgentEventType, payload: unknown): AgentFrame {
  return { v: PROTOCOL_VERSION, kind: 'event', type, payload };
}

/** Error frame answering a failed request. */
export function errorFrame(
  code: ProtocolErrorCode,
  message: string,
  correlation?: string
): AgentFrame<ProtocolErrorPayload> {
  return {
    v: PROTOCOL_VERSION,
    kind: 'error',
    type: 'protocol.error',
    payload: { code, message, ...(correlation !== undefined && { correlation }) },
  };
}

/** Version-mismatch warning; the session always continues (spec). */
export function protocolWarningFrame(payload: ProtocolWarningPayload): AgentFrame<ProtocolWarningPayload> {
  return { v: PROTOCOL_VERSION, kind: 'event', type: 'protocol.warning', payload };
}
