// cli/commands/agent-uninstall.test.ts — the CLI-only surface of
// `tako agent uninstall <remote>`: outcome → exit-code mapping. The uninstall
// ORDERING tests live with the flow in services/agent-uninstall.test.ts.
import { describe, expect, it, vi } from 'vitest';

import { runAgentUninstallDefault } from './agent-uninstall.js';
import { uninstallAgent } from '../../services/agent.js';

vi.mock('../../services/agent.js', () => ({
  uninstallAgent: vi.fn(),
}));

describe('runAgentUninstallDefault — CLI endpoint mapping', () => {
  it('refused → exit 1 with the reason on stderr; otherwise the flow exit code passes through', async () => {
    vi.mocked(uninstallAgent).mockResolvedValue({ kind: 'refused', reason: 'unknown remote "nas"' });
    await expect(runAgentUninstallDefault('nas')).resolves.toBe(1);

    vi.mocked(uninstallAgent).mockResolvedValue({ kind: 'uninstalled', exitCode: 0 });
    await expect(runAgentUninstallDefault('nas')).resolves.toBe(0);

    vi.mocked(uninstallAgent).mockResolvedValue({ kind: 'uninstalled', exitCode: 1 });
    await expect(runAgentUninstallDefault('nas')).resolves.toBe(1);
  });
});
