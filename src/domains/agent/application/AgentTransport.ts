// AgentTransport.ts — PORT interface (application layer owns this, task 3.6)
//
// Client-side transport to the remote agent (spec `agent-transport`): the v0
// adapter is SSH streamLocal forwarding (WU4); a relay/tunnel transport may
// replace it later without touching domain or use-case code. The adapter owns
// the version handshake: `connect()` resolves only after hello/hello_ack, and
// a mismatch surfaces as `handshake.warning` — the session NEVER blocks on it.
import type {
  AgentFrame,
  AgentRequestMap,
  AgentRequestType,
  HelloAckPayload,
  ProtocolWarningPayload,
} from '../domain/protocol.js';

/** Result of the connect-time version handshake. */
export interface AgentHandshake {
  readonly ack: HelloAckPayload;
  /** Present when versions/protocol mismatch — advisory only, session continues. */
  readonly warning?: ProtocolWarningPayload;
}

/** One connected, multiplexed session to the agent (concurrent requests allowed). */
export interface AgentSession {
  readonly handshake: AgentHandshake;
  /** Typed request; the adapter matches the response via the correlation id. */
  request<K extends AgentRequestType>(
    type: K,
    payload: AgentRequestMap[K]['request']
  ): Promise<AgentRequestMap[K]['response']>;
  /** Subscribe to push events; returns the unsubscribe function. */
  onEvent(listener: (event: AgentFrame) => void): () => void;
  /** Close the session and the underlying channel. */
  close(): Promise<void>;
}

/** Port: open an agent session over the transport (SSH identity IS the auth — no extra credential). */
export interface AgentTransport {
  connect(): Promise<AgentSession>;
}
