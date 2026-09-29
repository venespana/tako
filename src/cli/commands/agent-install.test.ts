// cli/commands/agent-install.test.ts — the CLI-only surface of
// `tako agent install <remote>`: the 9.18 session-password auth contract
// (decideRemoteAuth). The install FLOW tests live with the pipeline in
// domains/agent/infrastructure/AgentInstallPipeline.test.ts (shared with the
// TUI's in-process install since 9.19).
import { describe, expect, it } from 'vitest';

import { SESSION_PASSWORD_ENV } from '../../shared/lib/session-password.js';
import { decideRemoteAuth } from './agent-install.js';

describe('decideRemoteAuth — 9.18 interactive session password', () => {
  const SECRET = 'sescret-pw';
  const interactive = { credentialType: 'interactive' as const };

  it('contract: the session-password env var is TAKO_SSH_PASSWORD (CLI credential resolvers read it)', () => {
    expect(SESSION_PASSWORD_ENV).toBe('TAKO_SSH_PASSWORD');
  });

  it('accepts the session password for an interactive remote (terminal runs supply it via the environment)', () => {
    const decision = decideRemoteAuth('nas', interactive, SECRET, cipher => cipher);
    expect(decision).toEqual({ kind: 'resolved', auth: { type: 'password', password: SECRET } });
  });

  it('refuses an interactive remote WITHOUT a session password, message unchanged', () => {
    const decision = decideRemoteAuth('nas', interactive, undefined, cipher => cipher);
    expect(decision).toEqual({
      kind: 'refusal',
      reason:
        'remote "nas" uses interactive credentials — the agent CLI needs non-interactive access; re-add it with a stored password or key',
    });
  });

  it('an empty TAKO_SSH_PASSWORD counts as absent', () => {
    const decision = decideRemoteAuth('nas', interactive, '', cipher => cipher);
    expect(decision).toEqual({ kind: 'refusal', reason: expect.stringContaining('interactive credentials') });
  });

  it('the session password never leaks into refusals or other remotes’ auth', () => {
    const refusal = decideRemoteAuth('nas', interactive, undefined, cipher => cipher);
    expect(JSON.stringify(refusal)).not.toContain(SECRET);

    const keyDecision = decideRemoteAuth('nas', { credentialType: 'ssh-key', keyPath: '/keys/id_ed25519' }, SECRET, cipher =>
      cipher
    );
    expect(keyDecision).toEqual({ kind: 'resolved', auth: { type: 'key', keyPath: '/keys/id_ed25519' } });

    const storeDecision = decideRemoteAuth('nas', { credentialType: 'store', obfuscatedPassword: 'obf' }, SECRET, cipher =>
      `revealed:${cipher}`
    );
    expect(storeDecision).toEqual({ kind: 'resolved', auth: { type: 'password', password: 'revealed:obf' } });
  });
});
