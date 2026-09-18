// AgentChannel.ts — PORT interface (application layer owns this)
import type { Duplex } from 'node:stream';

/** Default agent socket path on the remote host (`~` expands to the remote home). */
export const DEFAULT_AGENT_SOCKET_PATH = '~/.tako/agent.sock';

export interface AgentChannelOpenOptions {
  /** Remote unix socket path; `~` expands to the remote home directory. */
  readonly socketPath?: string;
}

/**
 * Port: framed duplex channel to the remote agent's unix socket, forwarded
 * over the existing SSH connection (OpenSSH direct-streamlocal).
 *
 * Frame surface: the returned stream is a Duplex in object mode where each
 * object is a `string` holding ONE newline-delimited JSON frame (trailing
 * delimiter stripped on read, appended on write). The JSON payload of each
 * frame is an agent protocol frame — `agent/domain/protocol.ts` (WU3) owns
 * the canonical `AgentFrame` type and its codec, which satisfy this
 * structural contract. This port stays protocol-agnostic: remotes never
 * imports agent at runtime.
 */
export interface AgentChannel {
  /** Open a forwarded channel; resolves once the duplex stream is wired. */
  open(options?: AgentChannelOpenOptions): Promise<Duplex>;
  /** Tear down every channel opened by this instance. */
  close(): Promise<void>;
}
