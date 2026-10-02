// cli/commands/agent-install.test.ts — the CLI-only surface of
// `tako agent install <remote>`: the command reads the session password from
// the environment (9.18) and maps the service outcome to exit codes. The
// unified auth decision and the install flow tests live with their service
// (services/remotes.test.ts, services/agent.test.ts) and the pipeline
// (domains/agent/infrastructure/AgentInstallPipeline.test.ts).
import { describe, expect, it, vi } from 'vitest';

import { installAgent } from '../../services/agent.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';
import { runAgentInstallDefault } from './agent-install.js';

vi.mock('../../services/agent.js', () => ({
  installAgent: vi.fn(),
}));

describe('runAgentInstallDefault — CLI endpoint mapping', () => {
  it('contract: the session-password env var is TAKO_SSH_PASSWORD (CLI credential resolvers read it)', () => {
    expect(SESSION_PASSWORD_ENV).toBe('TAKO_SSH_PASSWORD');
  });

  it('installed → exit 0; refused → exit 1 with the reason on stderr; failed → exit 1', async () => {
    vi.mocked(installAgent).mockResolvedValue({ kind: 'installed' });
    await expect(runAgentInstallDefault('nas')).resolves.toBe(0);
    expect(vi.mocked(installAgent)).toHaveBeenCalledWith({ remote: 'nas', sessionPassword: undefined });

    vi.mocked(installAgent).mockResolvedValue({ kind: 'refused', reason: 'no session password' });
    await expect(runAgentInstallDefault('nas')).resolves.toBe(1);

    vi.mocked(installAgent).mockResolvedValue({ kind: 'failed', error: 'probe FAILED' });
    await expect(runAgentInstallDefault('nas')).resolves.toBe(1);
  });

  it('the command passes the env session password through (never argv)', async () => {
    process.env[SESSION_PASSWORD_ENV] = 'terminal-pw';
    vi.mocked(installAgent).mockResolvedValue({ kind: 'installed' });
    try {
      await runAgentInstallDefault('nas');
      expect(vi.mocked(installAgent)).toHaveBeenLastCalledWith({ remote: 'nas', sessionPassword: 'terminal-pw' });
    } finally {
      delete process.env[SESSION_PASSWORD_ENV];
    }
  });
});
