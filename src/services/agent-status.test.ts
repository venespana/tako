// services/agent-status.test.ts — the one-shot agent status query (moved
// from the former cli/commands/agent-status handler; STRICT TDD RED phase,
// task 6.5). The SERVICE returns the typed outcome; the CLI owns the text
// table (formatAgentStatus stays tested next to the command that prints it).
import { describe, expect, it } from 'vitest';

import { runAgentStatus } from './agent.js';
import type { AgentHandshake, AgentSession, AgentTransport } from '../domains/agent/application/AgentTransport.js';
import type { AgentStatusResult } from '../domains/agent/domain/protocol.js';

const CLIENT_VERSION = '0.1.2';

const STATUS: AgentStatusResult = {
  agentVersion: '0.1.2',
  protocol: 1,
  uptimeSec: 3600,
  jobCount: 3,
  unitState: 'active',
  linger: true,
  lingerByTako: true,
};

const okHandshake = (agentVersion = CLIENT_VERSION): AgentHandshake => ({
  ack: { agentVersion, protocol: 1, agentStartId: 'start-1' },
});

interface TransportHarness {
  readonly transport: AgentTransport;
  readonly sessionClosed: () => boolean;
}

function fakeTransport(
  handshake: AgentHandshake,
  status: AgentStatusResult = STATUS,
  failRequest?: Error
): TransportHarness {
  let closed = false;
  const session: AgentSession = {
    handshake,
    request: async type => {
      if (type !== 'agent.status') throw new Error(`unexpected ${String(type)}`);
      if (failRequest) throw failRequest;
      return { ...status, agentVersion: handshake.ack.agentVersion };
    },
    onEvent: () => () => {},
    close: async () => {
      closed = true;
    },
  };
  return { transport: { connect: async () => session }, sessionClosed: () => closed };
}

describe('runAgentStatus — typed outcome over one session', () => {
  it('6.5 RED: ok carries the handshake + status payload and closes the session', async () => {
    const harness = fakeTransport(okHandshake());

    const outcome = await runAgentStatus({ transport: harness.transport });

    expect(outcome).toEqual({
      kind: 'ok',
      handshake: okHandshake(),
      status: { ...STATUS, agentVersion: '0.1.2' },
    });
    expect(harness.sessionClosed()).toBe(true);
  });

  it('6.5 RED: a warning handshake still resolves ok — the session never blocks (spec)', async () => {
    const warning: AgentHandshake = {
      ack: { agentVersion: '0.0.9', protocol: 1, agentStartId: 'start-1' },
      warning: { clientVersion: CLIENT_VERSION, agentVersion: '0.0.9', detail: 'agent version differs from client' },
    };

    const outcome = await runAgentStatus({ transport: fakeTransport(warning).transport });

    expect(outcome.kind).toBe('ok');
    expect(outcome.kind === 'ok' && outcome.handshake.warning?.detail).toBe('agent version differs from client');
  });

  it('6.5 RED: unreachable agent → the unreachable outcome with the connect failure detail', async () => {
    const outcome = await runAgentStatus({
      transport: {
        connect: async () => {
          throw new Error('channel open error');
        },
      },
    });

    expect(outcome).toEqual({ kind: 'unreachable', detail: 'channel open error' });
  });

  it('6.5 RED: a failed request → the failed outcome with the reason (session closed in any case)', async () => {
    const harness = fakeTransport(okHandshake(), STATUS, new Error('request timed out'));

    const outcome = await runAgentStatus({ transport: harness.transport });

    expect(outcome).toEqual({ kind: 'failed', detail: 'request timed out' });
    expect(harness.sessionClosed()).toBe(true);
  });
});
