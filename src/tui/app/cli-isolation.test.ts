// cli-isolation.test.ts — Static guard: the TUI must not be imported by CLI code
// beyond the sanctioned ADR-0014 exception (the add-remote-wizard feature).
// This tests a repo boundary, not the router library, so it lives in app/.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const CLI_DIR = join(import.meta.dirname, '../../cli');

/** Recursively collect all .ts/.tsx files under a directory. */
function collectTsFiles(dir: string): string[] {
  let files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(collectTsFiles(full));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(full);
      }
    }
  } catch {
    // CLI dir may not exist in all environments
  }
  return files;
}

describe('CLI isolation', () => {
  it('src/cli/ imports tui only via the ADR-0014 wizard exception (no router internals)', () => {
    const cliFiles = collectTsFiles(CLI_DIR);
    if (cliFiles.length === 0) return; // No CLI dir, skip

    for (const file of cliFiles) {
      const content = readFileSync(file, 'utf-8');
      // The router library (react-router, the generated route tree, and the
      // old custom router) must never leak into cli/; the wizard feature is
      // the only tui import allowed (checked separately by eslint zones).
      expect(content).not.toMatch(/shared\/router|app\/router|react-router|routes\.generated|tui\/routes/);
      if (content.includes('tui/')) {
        expect(content.includes('add-remote-wizard')).toBe(true);
      }
    }
  });
});
