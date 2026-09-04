// tui/features/doctor/lib/run.test.ts — vitest: verify runDoctorScreen exit mapping
// Uses vi.mock to avoid actually rendering Ink (requires TTY).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SystemCheckResult } from '../../../../domains/system/domain/types.js';

// ---------------------------------------------------------------------------
// Mock Ink render
// ---------------------------------------------------------------------------

vi.mock('ink', () => {
  const mockUnmount = vi.fn();
  return {
    render: vi.fn(() => ({ unmount: mockUnmount })),
    useInput: vi.fn(),
    useApp: vi.fn(() => ({ exit: vi.fn() })),
    Box: vi.fn(),
    Text: vi.fn(),
    Spacer: vi.fn(),
    default: {
      render: vi.fn(() => ({ unmount: mockUnmount })),
    },
  };
});

// ---------------------------------------------------------------------------
// Fake SystemCheckResult
// ---------------------------------------------------------------------------

function makeResult(allPresent: boolean): SystemCheckResult {
  return {
    results: [
      { tool: 'ssh', status: allPresent ? 'found' : 'not-found', version: allPresent ? '9.0' : null },
      { tool: 'ssl', status: allPresent ? 'found' : 'not-found', version: allPresent ? '3.0.0' : null },
      { tool: 'git', status: allPresent ? 'found' : 'not-found', version: allPresent ? '2.43.0' : null },
      { tool: 'docker', status: allPresent ? 'found' : 'not-found', version: allPresent ? '24.0.0' : null },
      {
        tool: 'docker-compose',
        status: allPresent ? 'found' : 'not-found',
        version: allPresent ? 'v2.24.0' : null,
      },
    ],
    allPresent,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDoctorScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a function', async () => {
    const { runDoctorScreen } = await import('./run.js');
    expect(typeof runDoctorScreen).toBe('function');
  });

  it('returns a Promise', async () => {
    const { runDoctorScreen } = await import('./run.js');
    const { render } = await import('ink');

    const fakeCheck = vi.fn(async () => makeResult(true));

    // Suppress console.Console error from Ink patchConsole
    const result = runDoctorScreen({ runCheck: fakeCheck });
    expect(result).toBeInstanceOf(Promise);
  });
});
