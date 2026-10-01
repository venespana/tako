// ConnectAgent.ts — use case: open a session and classify the handshake (task 3.10)
//
// The transport adapter owns hello/hello_ack (spec `agent-transport#Version-Handshake`);
// this use case turns the handshake into the client-view lifecycle badge. A
// mismatch NEVER blocks: the session is returned with `version_mismatch`.
import type { AgentLifecycle } from '../../domain/types.js';
import type { AgentHandshake, AgentSession, AgentTransport } from '../AgentTransport.js';

export interface ConnectAgentResult {
  readonly session: AgentSession;
  readonly handshake: AgentHandshake;
  readonly lifecycle: AgentLifecycle;
}

export class ConnectAgent {
  constructor(private readonly transport: AgentTransport) {}

  /**
   * Connect and classify. A hello_ack proves the agent daemon is answering,
   * so a clean handshake maps to `active`; only a warning downgrades it.
   */
  async execute(): Promise<ConnectAgentResult> {
    const session = await this.transport.connect();
    const lifecycle: AgentLifecycle = session.handshake.warning ? 'version_mismatch' : 'active';
    return { session, handshake: session.handshake, lifecycle };
  }
}
