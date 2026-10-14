// application/use-cases/UninstallAgent.test.ts — STRICT TDD RED phase (task 3.10)
import { describe, it, expect } from 'vitest';

// RED: import the modules that don't exist yet
import { UNINSTALL_STEPS, shouldDisableLinger, uninstallLingerGuard } from './UninstallAgent.js';

describe('UninstallAgent — only-by-tako linger rule (design §Probe Mechanics uninstall)', () => {
  it('3.10 RED: linger is disabled ONLY when Tako enabled it', () => {
    expect(shouldDisableLinger(true)).toBe(true);
    expect(shouldDisableLinger(false)).toBe(false); // pre-existing linger must survive
    expect(shouldDisableLinger(undefined)).toBe(false); // never guessed
  });

  it('3.10 RED: unreachable status → keep linger enabled with an explicit warning', () => {
    const guard = uninstallLingerGuard(undefined);
    expect(guard.disableLinger).toBe(false);
    expect(guard.warning).toMatch(/linger/i);
  });

  it('3.10 RED: readable status → no warning, decision follows the by-tako flag', () => {
    expect(uninstallLingerGuard({ lingerByTako: true })).toEqual({ disableLinger: true, warning: undefined });
    expect(uninstallLingerGuard({ lingerByTako: false }).disableLinger).toBe(false);
  });

  it('3.10 RED: uninstall order stops the unit BEFORE deleting anything, verifies last', () => {
    expect(UNINSTALL_STEPS).toEqual([
      'read-linger-by-tako', // via agent transport BEFORE deleting anything
      'stop-unit',
      'remove-unit',
      'daemon-reload',
      'disable-linger-if-by-tako',
      'remove-agent-dir',
      'verify-residue',
    ]);
  });
});
