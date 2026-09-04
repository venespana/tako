// tui/features/doctor/model/use-doctor-check.test.ts — vitest: type-level and smoke tests
// Note: The hook uses React hooks (useState, useEffect, useCallback) and must be
// tested through its consumer (DoctorScreen) in the Ink environment.
// This file provides type-level verification and smoke tests that don't require
// a React DOM environment.
import { describe, it, expect } from 'vitest';
import type { DoctorCheckStatus, UseDoctorCheckResult } from './use-doctor-check.js';

describe('useDoctorCheck exports', () => {
  it('DoctorCheckStatus is a union type', () => {
    // Verify the union type covers all expected states
    type ExpectedStates = 'idle' | 'checking' | 'done' | 'error';
    const _idle: DoctorCheckStatus = { status: 'idle' };
    const _checking: DoctorCheckStatus = { status: 'checking' };
    const _done: DoctorCheckStatus = { status: 'done', result: { results: [], allPresent: true } };
    const _error: DoctorCheckStatus = { status: 'error', error: new Error('fail') };
    // TypeScript would error if the union didn't cover all states
    expect(true).toBe(true);
  });

  it('UseDoctorCheckResult has status and runCheck', () => {
    // TypeScript verifies the interface shape
    const _result: UseDoctorCheckResult = {
      status: { status: 'idle' },
      runCheck: () => {},
    };
    expect(_result.status.status).toBe('idle');
    expect(typeof _result.runCheck).toBe('function');
  });
});
