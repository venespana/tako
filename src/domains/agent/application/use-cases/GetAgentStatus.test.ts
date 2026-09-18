// application/use-cases/GetAgentStatus.test.ts — STRICT TDD RED phase (task 3.10)
import { describe, it, expect, vi } from 'vitest';
// RED: import the modules that don't exist yet
import { GetAgentStatus, computeAgentLifecycle } from './GetAgentStatus.js';
import type { AgentSession, AgentTransport } from '../AgentTransport.js';
import type { AgentStatusResult } from '../../domain/protocol.js';

const STATUS: AgentStatusResult = {
  agentVersion: '0.1.2',
  protocol: 1,
  uptimeSec: 120,
  jobCount: 3,
  unitState: 'active',
  linger: true,
  lingerByTako: true,
};

function transportWith(requestResult: AgentStatusResult): AgentTransport {
  const session: AgentSession = {
    handshake: { ack: { agentVersion: '0.1.2', protocol: 1, agentStartId: 's1' } },
    request: vi.fn(async () => requestResult) as AgentSession['request'],
    onEvent: vi.fn(() => () => {}),
    close: vi.fn(async () => {}),
  };
  return { connect: async () => session };
}

describe('GetAgentStatus (client)', () => {
  it('3.10 RED: sends agent.status and returns the typed result', async () => {
    const transport = transportWith(STATUS);
    const result = await new GetAgentStatus(transport).execute();
    expect(result).toEqual(STATUS);
    expect(result.unitState).toBe('active');
    expect(result.lingerByTako).toBe(true);
  });
});

describe('computeAgentLifecycle (pure — design §Job & Run Model client view)', () => {
  it('3.10 RED: failed connection → unreachable', () => {
    expect(computeAgentLifecycle({ connected: false, protocolMatch: true, unitState: 'active' })).toBe('unreachable');
  });

  it('3.10 RED: protocol mismatch wins over unit state → version_mismatch', () => {
    expect(computeAgentLifecycle({ connected: true, protocolMatch: false, unitState: 'active' })).toBe('version_mismatch');
  });

  it('3.10 RED: reachable, matching, unit active → active', () => {
    expect(computeAgentLifecycle({ connected: true, protocolMatch: true, unitState: 'active' })).toBe('active');
  });

  it('3.10 RED: unit not-found → not_installed', () => {
    expect(computeAgentLifecycle({ connected: true, protocolMatch: true, unitState: 'not-found' })).toBe('not_installed');
  });

  it('3.10 RED: inactive/failed/unknown/missing unit state → inactive_unit', () => {
    expect(computeAgentLifecycle({ connected: true, protocolMatch: true, unitState: 'inactive' })).toBe('inactive_unit');
    expect(computeAgentLifecycle({ connected: true, protocolMatch: true, unitState: 'failed' })).toBe('inactive_unit');
    expect(computeAgentLifecycle({ connected: true, protocolMatch: true, unitState: 'unknown' })).toBe('inactive_unit');
    expect(computeAgentLifecycle({ connected: true, protocolMatch: true, unitState: undefined })).toBe('inactive_unit');
  });
});
