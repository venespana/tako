// tui/test-utils/fake-agent-session.ts — Test doubles for the agent protocol
// surface: a canned-response FakeAgentSession (with manual push events) and a
// FakeTasksGateway over it. Test infrastructure, outside the FSD layers:
// importable only from test files.
import type { AgentHandshake, AgentSession } from '../../domains/agent/application/AgentTransport.js';
import type { AgentFrame, AgentRequestMap, AgentRequestType } from '../../domains/agent/domain/protocol.js';
import type { TasksGateway } from '../features/tasks/job-list/model/tasks-store.js';

export class FakeAgentSession implements AgentSession {
  handshake: AgentHandshake = { ack: { agentVersion: '0.1.2', protocol: 1, agentStartId: 'start-test' } };
  readonly requests: Array<{ type: AgentRequestType; payload: unknown }> = [];
  readonly responses = new Map<AgentRequestType, unknown>();
  readonly listeners: Array<(frame: AgentFrame) => void> = [];
  failNext: Error | null = null;
  closed = false;

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
}

export class FakeTasksGateway implements TasksGateway {
  readonly remote: string;
  readonly session = new FakeAgentSession();
  connectCalls = 0;
  cursor = 0;
  readonly savedCursors: number[] = [];
  connectError: Error | null = null;

  constructor(remote = 'nas') {
    this.remote = remote;
    // A real agent answers EVERY request type; default the unseeded ones to
    // empty-agent shapes so unspecified queries behave honestly.
    this.session.responses.set('jobs.list', { jobs: [] });
    this.session.responses.set('jobs.history', { runs: [], lastSeq: 0 });
  }

  async connect(): Promise<AgentSession> {
    this.connectCalls += 1;
    if (this.connectError !== null) throw this.connectError;
    return this.session;
  }

  loadCursor(): number {
    return this.cursor;
  }

  saveCursor(seq: number): void {
    this.cursor = seq;
    this.savedCursors.push(seq);
  }

  /** Seed agent.status + reconcile.sync with the given jobs/runs. */
  seedAgent(jobs: unknown[], runs: unknown[] = []): void {
    this.session.responses.set('agent.status', {
      agentVersion: '0.1.2',
      protocol: 1,
      uptimeSec: 42,
      jobCount: jobs.length,
      unitState: 'active',
      linger: true,
      lingerByTako: true,
    });
    this.session.responses.set('reconcile.sync', { jobs, runs, lastSeq: 7 });
  }
}
