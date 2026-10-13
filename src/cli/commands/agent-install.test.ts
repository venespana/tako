// cli/commands/agent-install.test.ts — the CLI-only surface of
// `tako agent install <remote>`: the command reads the session password from
// the environment (9.18) and maps the service outcome to exit codes. The
// unified auth decision and the install flow tests live with their service
// (services/remotes.test.ts, services/agent.test.ts) and the pipeline
// (domains/agent/infrastructure/AgentInstallPipeline.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runAgentInstallDefault } from './agent-install.js';
import { installAgent } from '../../services/agent.js';
import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';

vi.mock('../../services/agent.js', () => ({
  installAgent: vi.fn(),
}));

describe('runAgentInstallDefault — CLI endpoint mapping', () => {
  // R3-001 (E0 review debt): the refusal reason must reach STDERR — the exit
  // code alone is not observable enough for operators and scripts.
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('contract: the session-password env var is TAKO_SSH_PASSWORD (CLI credential resolvers read it)', () => {
    expect(SESSION_PASSWORD_ENV).toBe('TAKO_SSH_PASSWORD');
  });

  it('installed → exit 0 with nothing on stderr', async () => {
    vi.mocked(installAgent).mockResolvedValue({ kind: 'installed' });
    await expect(runAgentInstallDefault('nas')).resolves.toBe(0);
    expect(vi.mocked(installAgent)).toHaveBeenCalledWith({ remote: 'nas', sessionPassword: undefined });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('refused → exit 1 AND the refusal reason printed to STDERR (R3-001)', async () => {
    vi.mocked(installAgent).mockResolvedValue({ kind: 'refused', reason: 'no session password for remote "nas"' });
    await expect(runAgentInstallDefault('nas')).resolves.toBe(1);

    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0]?.[0]).toBe('no session password for remote "nas"');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('failed → exit 1 (the pipeline already streamed the error lines)', async () => {
    vi.mocked(installAgent).mockResolvedValue({ kind: 'failed', error: 'probe FAILED' });
    await expect(runAgentInstallDefault('nas')).resolves.toBe(1);
    expect(errSpy).not.toHaveBeenCalled();
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
