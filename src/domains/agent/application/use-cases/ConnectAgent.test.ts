// application/use-cases/ConnectAgent.test.ts — STRICT TDD RED phase (task 3.10)
import { describe, it, expect, vi } from 'vitest';
// RED: import the modules that don't exist yet
import { ConnectAgent } from './ConnectAgent.js';
import type { AgentSession, AgentTransport } from '../AgentTransport.js';

function fakeSession(handshake: AgentSession['handshake']): AgentSession {
  return {
    handshake,
    request: vi.fn(async () => {
      throw new Error('unexpected request');
    }) as AgentSession['request'],
    onEvent: vi.fn(() => () => {}),
    close: vi.fn(async () => {}),
  };
}

function fakeTransport(session: AgentSession): AgentTransport {
  return { connect: vi.fn(async () => session) };
}

describe('ConnectAgent', () => {
  it('3.10 RED: connects, exposes the session and the handshake ack, lifecycle active on clean handshake', async () => {
    const session = fakeSession({ ack: { agentVersion: '0.1.2', protocol: 1, agentStartId: 's1' } });
    const transport = fakeTransport(session);

    const result = await new ConnectAgent(transport).execute();

    expect(transport.connect).toHaveBeenCalledTimes(1);
    expect(result.session).toBe(session);
    expect(result.handshake.ack.agentVersion).toBe('0.1.2');
    expect(result.lifecycle).toBe('active');
  });
  it('3.10 RED: version-mismatch warning → lifecycle version_mismatch, session STILL returned (never blocks)', async () => {
    const session = fakeSession({
      ack: { agentVersion: '0.0.9', protocol: 1, agentStartId: 's1' },
      warning: { clientVersion: '0.1.2', agentVersion: '0.0.9', detail: 'client newer than agent' },
    });

    const result = await new ConnectAgent(fakeTransport(session)).execute();

    expect(result.session).toBe(session);
    expect(result.lifecycle).toBe('version_mismatch');
  });
});
