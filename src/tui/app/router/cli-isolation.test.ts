// cli-isolation.test.ts — Static guard: router-store must not be imported by CLI code.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const CLI_DIR = join(import.meta.dirname, '../../../src/cli');

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
  it('src/cli/ must not import router-store', () => {
    const cliFiles = collectTsFiles(CLI_DIR);
    if (cliFiles.length === 0) return; // No CLI dir, skip

    for (const file of cliFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/router-store/);
    }
  });
});
