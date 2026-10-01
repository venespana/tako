// infrastructure/StreamLocalAgentTransport.ts — client-side AgentTransport adapter (task 4.4)
//
// Opens the remotes AgentChannel (WU2) to the agent socket and drives the
// WU3 protocol client side: handshake (hello → hello_ack, mismatch surfaces
// as an ADVISORY warning — the session never blocks), correlation-ID
// multiplexing for concurrent requests, and push-event dispatch. The
// transport composes the remotes AgentChannel PORT via constructor injection
// (ADR-0015/D4: type-only coupling, runtime wiring in composition roots).
import { Duplex } from 'node:stream';

import type { AgentChannel, AgentChannelOpenOptions } from '../../remotes/application/AgentChannel.js';
import type { AgentHandshake, AgentSession, AgentTransport } from '../application/AgentTransport.js';
import {
  PROTOCOL_VERSION,
  decodeFrame,
  helloFrame,
  requestFrame,
  ProtocolFrameError,
  type AgentFrame,
  type AgentRequestMap,
  type AgentRequestType,
  type HelloAckPayload,
  type ProtocolWarningPayload,
} from '../domain/protocol.js';

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;

export class AgentTransportClosedError extends Error {
  constructor(detail: string) {
    super(`agent session closed: ${detail}`);
    this.name = 'AgentTransportClosedError';
  }
}

export interface StreamLocalAgentTransportOptions {
  /** The remotes channel port (injected by the composition root). */
  readonly channel: AgentChannel;
  readonly clientVersion: string;
  readonly socketPath?: string;
  readonly requestTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ConnectedAgentSessionDeps {
  readonly handshake: AgentHandshake;
  readonly stream: Duplex;
  readonly pending: Map<string, PendingRequest>;
  readonly listeners: Set<(frame: AgentFrame) => void>;
  readonly requestTimeoutMs: number;
  readonly onClose: (detail: string) => void;
}

/** One live multiplexed session; correlation ids are per-session. */
class ConnectedAgentSession implements AgentSession {
  readonly handshake: AgentHandshake;
  readonly #stream: Duplex;
  readonly #pending: Map<string, PendingRequest>;
  readonly #listeners: Set<(frame: AgentFrame) => void>;
  readonly #requestTimeoutMs: number;
  readonly #onClose: (detail: string) => void;
  #closed = false;

  constructor(deps: ConnectedAgentSessionDeps) {
    this.handshake = deps.handshake;
    this.#stream = deps.stream;
    this.#pending = deps.pending;
    this.#listeners = deps.listeners;
    this.#requestTimeoutMs = deps.requestTimeoutMs;
    this.#onClose = deps.onClose;
  }

  /** Typed request; the adapter matches the response via the correlation id. */
  async request<K extends AgentRequestType>(
    type: K,
    payload: AgentRequestMap[K]['request']
  ): Promise<AgentRequestMap[K]['response']> {
    if (this.#closed) {
      throw new AgentTransportClosedError('requests are not accepted after close()');
    }
    const result = await new Promise<unknown>((resolve, reject) => {
      const id = nextCorrelationId(this.#pending);
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`agent request ${type} timed out after ${this.#requestTimeoutMs}ms`));
      }, this.#requestTimeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#stream.write(JSON.stringify(requestFrame(id, type, payload)));
    });
    return result as AgentRequestMap[K]['response'];
  }

  onEvent(listener: (frame: AgentFrame) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#onClose('close() called');
    this.#stream.destroy();
  }
}

export class StreamLocalAgentTransport implements AgentTransport {
  readonly #channel: AgentChannel;
  readonly #clientVersion: string;
  readonly #openOptions: AgentChannelOpenOptions;
  readonly #requestTimeoutMs: number;

  constructor(options: StreamLocalAgentTransportOptions) {
    this.#channel = options.channel;
    this.#clientVersion = options.clientVersion;
    // No socketPath → the channel port applies its own default (~/.tako/agent.sock).
    this.#openOptions = options.socketPath !== undefined ? { socketPath: options.socketPath } : {};
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Open a channel, perform the hello/hello_ack handshake, and return the
   * multiplexed session. A version/protocol mismatch becomes
   * `handshake.warning` — the session is ALWAYS returned (spec).
   */
  async connect(): Promise<AgentSession> {
    const stream = await this.#channel.open(this.#openOptions);
    const pending = new Map<string, PendingRequest>();
    const listeners = new Set<(frame: AgentFrame) => void>();

    const rejectAll = (detail: string): void => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new AgentTransportClosedError(detail));
      }
      pending.clear();
    };

    try {
      const handshake = await this.#handshake(stream);
      // Events already buffered on the stream are drained by the pump below;
      // the handshake consumed only frames up to hello_ack.
      this.#pump(stream, pending, listeners, rejectAll);

      return new ConnectedAgentSession({
        handshake,
        stream,
        pending,
        listeners,
        requestTimeoutMs: this.#requestTimeoutMs,
        onClose: rejectAll,
      });
    } catch (error) {
      rejectAll(error instanceof Error ? error.message : 'connect failed');
      stream.destroy();
      throw error;
    }
  }

  /** Send hello and await hello_ack (timeout-guarded); compute the advisory warning. */
  async #handshake(stream: Duplex): Promise<AgentHandshake> {
    // The design table pins hello → hello_ack as the first two frames; the
    // opener is built here to keep v/protocol/caps consistent at one site.
    this.#writeFrame(stream, helloFrame(this.#clientVersion));

    const firstFrame = await this.#nextFrame(stream, DEFAULT_HANDSHAKE_TIMEOUT_MS);
    if (firstFrame.kind === 'error') {
      const payload = (firstFrame.payload ?? {}) as { code?: string; message?: string };
      throw new Error(`agent handshake failed (${payload.code ?? 'error'}): ${payload.message ?? 'no detail'}`);
    }
    if (firstFrame.kind !== 'hello_ack') {
      throw new ProtocolFrameError('kind', `expected hello_ack, got ${firstFrame.kind}`);
    }
    const ack = firstFrame.payload as HelloAckPayload;

    let warning: ProtocolWarningPayload | undefined;
    if (ack.protocol !== PROTOCOL_VERSION) {
      warning = {
        clientVersion: this.#clientVersion,
        agentVersion: ack.agentVersion,
        detail: `protocol version mismatch: client=${PROTOCOL_VERSION} agent=${ack.protocol}`,
      };
    } else if (ack.agentVersion !== this.#clientVersion) {
      warning = {
        clientVersion: this.#clientVersion,
        agentVersion: ack.agentVersion,
        detail: `agent version differs from client: client=${this.#clientVersion} agent=${ack.agentVersion} — re-run "tako agent install" to upgrade`,
      };
    }
    return { ack, ...(warning !== undefined && { warning }) };
  }

  #nextFrame(stream: Duplex, timeoutMs: number): Promise<AgentFrame> {
    return new Promise((resolve, reject) => {
      const buffered = stream.read();
      if (buffered !== null) {
        resolve(this.#decode(buffered as string));
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`agent handshake timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const onData = (frame: string): void => {
        cleanup();
        try {
          resolve(this.#decode(frame));
        } catch (error) {
          reject(error);
        }
      };
      const onEnd = (): void => {
        cleanup();
        reject(new AgentTransportClosedError('the channel ended before the handshake completed'));
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        stream.removeListener('data', onData);
        stream.removeListener('end', onEnd);
        stream.removeListener('error', onError);
      };
      stream.once('data', onData);
      stream.once('end', onEnd);
      stream.once('error', onError);
    });
  }

  #decode(frame: string): AgentFrame {
    return decodeFrame(frame);
  }

  /** Long-lived frame pump: responses/errors → pending map, events → listeners. */
  #pump(
    stream: Duplex,
    pending: Map<string, PendingRequest>,
    listeners: Set<(frame: AgentFrame) => void>,
    rejectAll: (detail: string) => void
  ): void {
    const onEnd = (): void => rejectAll('the channel ended');
    const onError = (): void => rejectAll('channel error');
    stream.on('data', frame => {
      let decoded: AgentFrame;
      try {
        decoded = this.#decode(frame as string);
      } catch {
        // A malformed mid-session frame poisons the correlation stream —
        // surface it as a session failure rather than silently dropping it.
        rejectAll('malformed frame received');
        stream.destroy();
        return;
      }
      switch (decoded.kind) {
        case 'response': {
          const entry = decoded.id !== undefined ? pending.get(decoded.id) : undefined;
          if (entry) {
            pending.delete(decoded.id as string);
            clearTimeout(entry.timer);
            entry.resolve(decoded.payload);
          }
          return;
        }
        case 'error': {
          const payload = (decoded.payload ?? {}) as { correlation?: string; code?: string; message?: string };
          const target = payload.correlation !== undefined ? pending.get(payload.correlation) : undefined;
          if (target) {
            pending.delete(payload.correlation as string);
            clearTimeout(target.timer);
            target.reject(new Error(`agent error (${payload.code ?? 'error'}): ${payload.message ?? 'no detail'}`));
          }
          return;
        }
        case 'event':
          for (const listener of listeners) listener(decoded);
          return;
        default:
          // hello/hello_ack after the handshake are protocol violations.
          rejectAll(`unexpected ${decoded.kind} frame after handshake`);
          stream.destroy();
      }
    });
    stream.once('end', onEnd);
    stream.once('error', onError);
  }

  #writeFrame(stream: Duplex, frame: AgentFrame): void {
    stream.write(JSON.stringify(frame));
  }
}

let correlationCounter = 0;

function nextCorrelationId(pending: Map<string, PendingRequest>): string {
  let id = `c${++correlationCounter}`;
  while (pending.has(id)) {
    id = `c${++correlationCounter}`;
  }
  return id;
}
