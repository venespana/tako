// cli/index.test.ts — agent family registration (task 6.2, 6.6)
//
// The `agent` family must exist with the exact ADR-0015 surface
// (run | install | uninstall | status), registered LAZILY (no command module
// is imported at registration time — Ink stays out of the CLI module graph).
import { describe, expect, it, type MockInstance, vi } from 'vitest';

import { buildProgram } from './index.js';

describe('cli program — agent family (task 6.2)', () => {
  it('6.2 RED: registers agent with run|install|uninstall|status', () => {
    const program = buildProgram();
    const agent = program.commands.find(command => command.name() === 'agent');

    expect(agent).toBeDefined();
    expect(agent?.commands.map(child => child.name())).toEqual(['run', 'install', 'uninstall', 'status']);
  });

  it('6.2 RED: `agent run` accepts --socket-path; client commands take a required <remote>', () => {
    const program = buildProgram();
    const agent = program.commands.find(command => command.name() === 'agent');
    const byName = new Map(agent?.commands.map(child => [child.name(), child]));

    expect(byName.get('run')?.options.some(option => option.long === '--socket-path')).toBe(true);
    expect(byName.get('install')?.registeredArguments[0]?.required).toBe(true);
    expect(byName.get('uninstall')?.registeredArguments[0]?.required).toBe(true);
    expect(byName.get('status')?.registeredArguments[0]?.required).toBe(true);
  });

  it('6.2 RED: `agent --help` renders without invoking any action (lazy registration)', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true) as MockInstance;
    try {
      const program = buildProgram();
      const agent = program.commands.find(command => command.name() === 'agent');
      // commander writes help asynchronously on the next tick for .help();
      // use the Help formatter directly to stay synchronous and side-effect free.
      const helpText = agent?.helpInformation();

      expect(helpText).toContain('run');
      expect(helpText).toContain('install');
      expect(helpText).toContain('uninstall');
      expect(helpText).toContain('status');
    } finally {
      writeSpy.mockRestore();
    }
  });
});
