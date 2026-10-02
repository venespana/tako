// cli/commands/agent-status.test.ts — the CLI-only surface of
// `tako agent status <remote>`: the text table and the exit-code mapping.
// The session query outcome tests live with the service
// (services/agent-status.test.ts).
import { describe, expect, it, vi } from 'vitest';

import type { AgentHandshake, AgentStatusResult } from '../../services/agent.js';
import { fetchAgentStatus } from '../../services/agent.js';
import { formatAgentStatus, runAgentStatusDefault } from './agent-status.js';

vi.mock('../../services/agent.js', async importOriginal => {
  // The real module would wire SSH adapters on call; only fetchAgentStatus is
  // replaced — formatAgentStatus is the command's own pure formatter.
  const actual = await importOriginal<typeof import('../../services/agent.js')>();
  return { ...actual, fetchAgentStatus: vi.fn() };
});

const STATUS: AgentStatusResult = {
  agentVersion: '0.1.2',
  protocol: 1,
  uptimeSec: 3600,
  jobCount: 3,
  unitState: 'active',
  linger: true,
  lingerByTako: true,
};

const okHandshake = (agentVersion = '0.1.2'): AgentHandshake => ({
  ack: { agentVersion, protocol: 1, agentStartId: 'start-1' },
});

describe('formatAgentStatus — 6.5 text table', () => {
  it('renders the full table: unit, linger (+by-tako), versions, protocol, jobs, handshake', () => {
    const table = formatAgentStatus(okHandshake(), STATUS, '0.1.2');

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

  it('handshake version mismatch is shown as a warning line', () => {
    const warning: AgentHandshake = {
      ack: { agentVersion: '0.0.9', protocol: 1, agentStartId: 'start-1' },
      warning: { clientVersion: '0.1.2', agentVersion: '0.0.9', detail: 'agent version differs from client' },
    };

    const table = formatAgentStatus(warning, { ...STATUS, agentVersion: '0.0.9' }, '0.1.2');

    expect(table).toContain('0.0.9');
    expect(table).toContain('warning');
  });
});

describe('runAgentStatusDefault — CLI endpoint mapping', () => {
  it('ok → the table on stdout, exit 0; refusals and failures → stderr, exit 1', async () => {
    vi.mocked(fetchAgentStatus).mockResolvedValue({ kind: 'ok', handshake: okHandshake(), status: STATUS });
    await expect(runAgentStatusDefault('nas')).resolves.toBe(0);

    vi.mocked(fetchAgentStatus).mockResolvedValue({ kind: 'refused', reason: 'unknown remote "nas"' });
    await expect(runAgentStatusDefault('nas')).resolves.toBe(1);

    vi.mocked(fetchAgentStatus).mockResolvedValue({ kind: 'unreachable', detail: 'channel open error' });
    await expect(runAgentStatusDefault('nas')).resolves.toBe(1);

    vi.mocked(fetchAgentStatus).mockResolvedValue({ kind: 'failed', detail: 'request timed out' });
    await expect(runAgentStatusDefault('nas')).resolves.toBe(1);
  });
});
