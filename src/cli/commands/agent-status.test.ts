// cli/commands/agent-status.test.ts — STRICT TDD RED phase (task 6.5)
//
// `tako agent status <remote>`: one text table with unit state, linger
// (+by-tako), agent/client version + protocol, jobs count, handshake result.
import { describe, expect, it } from 'vitest';

import type { AgentHandshake, AgentSession, AgentTransport } from '../../domains/agent/application/AgentTransport.js';
import type { AgentStatusResult } from '../../domains/agent/domain/protocol.js';
import { runAgentStatus, type AgentStatusDeps } from './agent-status.js';

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

function fakeTransport(handshake: AgentHandshake, status: AgentStatusResult = STATUS, warnDetail?: string): AgentTransport {
  const session: AgentSession = {
    handshake,
    request: async type => {
      if (type !== 'agent.status') throw new Error(`unexpected ${String(type)}`);
      if (warnDetail) throw new Error(warnDetail);
      return { ...status, agentVersion: handshake.ack.agentVersion };
    },
    onEvent: () => () => {},
    close: async () => {},
  };
  return { connect: async () => session };
}

function createDeps(transport: AgentTransport): { deps: AgentStatusDeps; out: { lines: string[] }; errs: { lines: string[] } } {
  const out = { lines: [] as string[] };
  const errs = { lines: [] as string[] };
  const deps: AgentStatusDeps = {
    transport,
    clientVersion: CLIENT_VERSION,
    log: line => {
      out.lines.push(line);
    },
    error: line => {
      errs.lines.push(line);
    },
  };
  return { deps, out, errs };
}

const okHandshake = (agentVersion = CLIENT_VERSION): AgentHandshake => ({
  ack: { agentVersion, protocol: 1, agentStartId: 'start-1' },
});

describe('runAgentStatus', () => {
  it('6.5 RED: renders the full text table and exits 0', async () => {
    const { deps, out } = createDeps(fakeTransport(okHandshake()));

    const exitCode = await runAgentStatus(deps);

    expect(exitCode).toBe(0);
    const table = out.lines.join('\n');
    expect(table).toContain('unit');
    expect(table).toContain('active');
    expect(table).toContain('linger');
    expect(table).toContain('enabled by tako');
    expect(table).toContain('0.1.2');
    expect(table).toContain('protocol');
    expect(table).toContain('1');
    expect(table).toContain('3');
    expect(table.toLowerCase()).toContain('handshake');
    expect(table).toContain('ok');
  });

  it('6.5 RED: handshake version mismatch is shown as a warning line (session continues)', async () => {
    const warning = {
      ack: { agentVersion: '0.0.9', protocol: 1, agentStartId: 'start-1' },
      warning: {
        clientVersion: CLIENT_VERSION,
        agentVersion: '0.0.9',
        detail: 'agent version differs from client',
      },
    };
    const { deps, out } = createDeps(fakeTransport(warning));

    const exitCode = await runAgentStatus(deps);

    expect(exitCode).toBe(0);
    const table = out.lines.join('\n');
    expect(table).toContain('0.0.9');
    expect(table).toContain('warning');
  });

  it('6.5 RED: unreachable agent → exit 1 with an actionable message', async () => {
    const { deps, errs } = createDeps({
      connect: async () => {
        throw new Error('channel open error');
      },
    });

    const exitCode = await runAgentStatus(deps);

    expect(exitCode).toBe(1);
    expect(errs.lines.join('\n')).toContain('unreachable');
    expect(errs.lines.join('\n')).toContain('channel open error');
  });
});
