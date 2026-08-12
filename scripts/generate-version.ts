#!/usr/bin/env bun
// generate-version.ts — reads package.json version → writes src/shared/lib/version.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const pkgPath = resolve(rootDir, 'package.json');
const versionPath = resolve(rootDir, 'src/shared/lib/version.ts');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
const version = pkg.version ?? '0.0.0';

const content = `// version.ts — Build-time codegen target. Written by scripts/generate-version.ts.
export const VERSION = '${version}';
`;

writeFileSync(versionPath, content, 'utf8');
console.log(`Wrote VERSION = '${version}' to ${versionPath}`);
