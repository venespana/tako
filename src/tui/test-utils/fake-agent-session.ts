// tui/test-utils/fake-agent-session.ts — Test double for the agent protocol
// surface: a canned-response FakeAgentSession (with manual push events) to
// pair with the MOCKED services/agent module (ADR-0019 §7: tests mock service
// modules instead of injecting gateway fakes). Test infrastructure, outside
// the FSD layers: importable only from test files.
import type {
  AgentFrame,
  AgentHandshake,
  AgentRequestMap,
  AgentRequestType,
  AgentSession,
} from '../../services/agent.js';

export class FakeAgentSession implements AgentSession {
  handshake: AgentHandshake = { ack: { agentVersion: '0.1.2', protocol: 1, agentStartId: 'start-test' } };
  readonly requests: Array<{ type: AgentRequestType; payload: unknown }> = [];
  readonly responses = new Map<AgentRequestType, unknown>();
  readonly listeners: Array<(frame: AgentFrame) => void> = [];
  failNext: Error | null = null;
  closed = false;

  constructor() {
    // A real agent answers EVERY request type; default the unseeded ones to
    // empty-agent shapes so unspecified queries behave honestly.
    this.responses.set('jobs.list', { jobs: [] });
    this.responses.set('jobs.history', { runs: [], lastSeq: 0 });
  }

  async request<K extends AgentRequestType>(
    type: K,
    payload: AgentRequestMap[K]['request']
  ): Promise<AgentRequestMap[K]['response']> {
    this.requests.push({ type, payload });
    if (this.failNext !== null) throw this.failNext;
    return structuredClone(this.responses.get(type)) as AgentRequestMap[K]['response'];
  }

  onEvent(listener: (frame: AgentFrame) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  /** Simulate an agent push event arriving over the socket. */
  emit(frame: AgentFrame): void {
    for (const listener of [...this.listeners]) listener(frame);
  }

  /** Seed agent.status + reconcile.sync with the given jobs/runs. */
  seedAgent(jobs: unknown[], runs: unknown[] = []): void {
    this.responses.set('agent.status', {
      agentVersion: '0.1.2',
      protocol: 1,
      uptimeSec: 42,
      jobCount: jobs.length,
      unitState: 'active',
      linger: true,
      lingerByTako: true,
    });
    this.responses.set('reconcile.sync', { jobs, runs, lastSeq: 7 });
  }
}
