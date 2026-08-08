// doctor-report.test.ts — STRICT TDD RED phase (formatter unit test)
import { describe, it, expect } from 'vitest';
import type { ToolCheckResult } from '../../domains/system/domain/types.js';
import { formatToolLine } from './doctor-report.js';

describe('formatToolLine', () => {
  it('5.3 RED: found tool → green marker + tool name + version', () => {
    const result: ToolCheckResult = {
      tool: 'git',
      status: 'found',
      version: '2.43.0', // adapter already normalized
    };

    const line = formatToolLine(result);

    // Should contain ✓ (green checkmark), 'git', and the normalized version
    expect(line).toContain('✓');
    expect(line).toContain('git');
    expect(line).toContain('2.43.0');
  });

  it('5.3 RED: missing tool → red marker + tool name + not found', () => {
    const result: ToolCheckResult = {
      tool: 'docker',
      status: 'not-found',
      version: null,
    };

    const line = formatToolLine(result);

    // Should contain ✖ (red X), 'docker', and 'not found'
    expect(line).toContain('✖');
    expect(line).toContain('docker');
    expect(line).toContain('not found');
  });

  it('5.3 RED: found tool with null version → still shows green marker', () => {
    const result: ToolCheckResult = {
      tool: 'ssh',
      status: 'found',
      version: null,
    };

    const line = formatToolLine(result);

    expect(line).toContain('✓');
    expect(line).toContain('ssh');
  });
});
