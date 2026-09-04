// cli/commands/remote-add.test.ts — STRICT TDD RED phase
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AddRemoteResult } from '../../domains/remotes/domain/types.js';

// Import the function under test (RED — implementation doesn't exist yet)
import { runRemoteAdd } from './remote-add.js';

// ---------------------------------------------------------------------------
// Mock runAddRemoteWizard — controls what the TUI wizard returns
// ---------------------------------------------------------------------------

vi.mock('../../tui/features/remotes/add-remote-wizard/index.js', () => {
  return {
    runAddRemoteWizard: vi.fn().mockImplementation(() => Promise.resolve({ saved: true })),
  };
});

// ---------------------------------------------------------------------------
// Exit code mapping tests (spec Requirement: Exit Codes)
// ---------------------------------------------------------------------------

describe('runRemoteAdd exit codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // (a) saved → exit code 0
  it('5.2 RED: saved → exit code 0', async () => {
    const runAddRemoteWizard = await import('../../tui/features/remotes/add-remote-wizard/index.js');
    (runAddRemoteWizard.runAddRemoteWizard as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ saved: true });

    const exitCode = await runRemoteAdd({
      checkDuplicate: {
        check: vi.fn(),
      } as unknown as import('../../domains/remotes/application/CheckDuplicateRemote.js').CheckDuplicateRemote,
      validateConnection: {
        validate: vi.fn(),
      } as unknown as import('../../domains/remotes/application/ValidateSshConnection.js').ValidateSshConnection,
      vault: { obfuscate: vi.fn(), reveal: vi.fn() },
      repo: { existsByName: vi.fn(), existsByEndpoint: vi.fn(), save: vi.fn(), list: vi.fn() },
    });

    expect(exitCode).toBe(0);
  });

  // (b) duplicate → exit code 1
  it('5.2 RED: duplicate → exit code 1', async () => {
    const runAddRemoteWizard = await import('../../tui/features/remotes/add-remote-wizard/index.js');
    (runAddRemoteWizard.runAddRemoteWizard as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      saved: false,
      reason: 'duplicate',
    });

    const exitCode = await runRemoteAdd({
      checkDuplicate: {
        check: vi.fn(),
      } as unknown as import('../../domains/remotes/application/CheckDuplicateRemote.js').CheckDuplicateRemote,
      validateConnection: {
        validate: vi.fn(),
      } as unknown as import('../../domains/remotes/application/ValidateSshConnection.js').ValidateSshConnection,
      vault: { obfuscate: vi.fn(), reveal: vi.fn() },
      repo: { existsByName: vi.fn(), existsByEndpoint: vi.fn(), save: vi.fn(), list: vi.fn() },
    });

    expect(exitCode).toBe(1);
  });

  // (c) validation → exit code 1
  it('5.2 RED: validation failure → exit code 1', async () => {
    const runAddRemoteWizard = await import('../../tui/features/remotes/add-remote-wizard/index.js');
    (runAddRemoteWizard.runAddRemoteWizard as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      saved: false,
      reason: 'validation',
    });

    const exitCode = await runRemoteAdd({
      checkDuplicate: {
        check: vi.fn(),
      } as unknown as import('../../domains/remotes/application/CheckDuplicateRemote.js').CheckDuplicateRemote,
      validateConnection: {
        validate: vi.fn(),
      } as unknown as import('../../domains/remotes/application/ValidateSshConnection.js').ValidateSshConnection,
      vault: { obfuscate: vi.fn(), reveal: vi.fn() },
      repo: { existsByName: vi.fn(), existsByEndpoint: vi.fn(), save: vi.fn(), list: vi.fn() },
    });

    expect(exitCode).toBe(1);
  });

  // (d) hostkey → exit code 1
  it('5.2 RED: hostkey declined → exit code 1', async () => {
    const runAddRemoteWizard = await import('../../tui/features/remotes/add-remote-wizard/index.js');
    (runAddRemoteWizard.runAddRemoteWizard as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      saved: false,
      reason: 'hostkey',
    });

    const exitCode = await runRemoteAdd({
      checkDuplicate: {
        check: vi.fn(),
      } as unknown as import('../../domains/remotes/application/CheckDuplicateRemote.js').CheckDuplicateRemote,
      validateConnection: {
        validate: vi.fn(),
      } as unknown as import('../../domains/remotes/application/ValidateSshConnection.js').ValidateSshConnection,
      vault: { obfuscate: vi.fn(), reveal: vi.fn() },
      repo: { existsByName: vi.fn(), existsByEndpoint: vi.fn(), save: vi.fn(), list: vi.fn() },
    });

    expect(exitCode).toBe(1);
  });

  // (e) abort → exit code 1
  it('5.2 RED: abort → exit code 1', async () => {
    const runAddRemoteWizard = await import('../../tui/features/remotes/add-remote-wizard/index.js');
    (runAddRemoteWizard.runAddRemoteWizard as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      saved: false,
      reason: 'abort',
    });

    const exitCode = await runRemoteAdd({
      checkDuplicate: {
        check: vi.fn(),
      } as unknown as import('../../domains/remotes/application/CheckDuplicateRemote.js').CheckDuplicateRemote,
      validateConnection: {
        validate: vi.fn(),
      } as unknown as import('../../domains/remotes/application/ValidateSshConnection.js').ValidateSshConnection,
      vault: { obfuscate: vi.fn(), reveal: vi.fn() },
      repo: { existsByName: vi.fn(), existsByEndpoint: vi.fn(), save: vi.fn(), list: vi.fn() },
    });

    expect(exitCode).toBe(1);
  });

  // (f) unexpected throw → exit code 2
  it('5.2 RED: unexpected throw → exit code 2', async () => {
    const runAddRemoteWizard = await import('../../tui/features/remotes/add-remote-wizard/index.js');
    (runAddRemoteWizard.runAddRemoteWizard as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('unexpected internal error')
    );

    const exitCode = await runRemoteAdd({
      checkDuplicate: {
        check: vi.fn(),
      } as unknown as import('../../domains/remotes/application/CheckDuplicateRemote.js').CheckDuplicateRemote,
      validateConnection: {
        validate: vi.fn(),
      } as unknown as import('../../domains/remotes/application/ValidateSshConnection.js').ValidateSshConnection,
      vault: { obfuscate: vi.fn(), reveal: vi.fn() },
      repo: { existsByName: vi.fn(), existsByEndpoint: vi.fn(), save: vi.fn(), list: vi.fn() },
    });

    expect(exitCode).toBe(2);
  });
});
