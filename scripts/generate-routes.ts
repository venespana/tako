#!/usr/bin/env bun
// scripts/generate-routes.ts — Codegen for the file-based route convention.
//
// Scans src/tui/routes/ and emits src/tui/routes.generated.ts: a typed
// react-router RouteObject[] that is committed to the repo (like TanStack's
// routeTree.gen.ts). Convention:
//   - layout.tsx  → layout route wrapping its sibling routes
//   - index.tsx   → index route at its layout's exact path
//   - name.tsx    → child route at /<dir>/name
//   - every subdirectory must define a layout.tsx
//
// Deterministic and idempotent: the scan is sorted and both the tree
// building and the emission are pure functions (unit-tested in
// src/tui/app/generate-routes.test.ts). Handles are NOT baked in here: the
// generated file uses namespace imports and defineRoute reads each module's
// `routeMeta` export at runtime.
//
// Run: bun run generate:routes

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** One node of the generated route tree, as pure data (no imports yet). */
export interface RouteSpec {
  /** Path segment relative to the parent layout ('/', 'remotes', 'list'). */
  path?: string;
  /** Index route: renders at the parent layout's exact path. */
  index?: true;
  /** Import specifier of the route module, relative to src/tui/. */
  importPath: string;
  /** Child routes nested under this layout route. */
  children?: RouteSpec[];
}

const ROUTES_DIR = join('src', 'tui', 'routes');
const OUTPUT_FILE = join('src', 'tui', 'routes.generated.ts');

/** Collect route .tsx files under routesDir ('/'-separated, relative, sorted,
 * test files excluded). Bun-only: called from the CLI entry, never imported
 * by tests. */
async function scanRouteFiles(routesDir: string): Promise<string[]> {
  const glob = new Bun.Glob('**/*.tsx');
  const files: string[] = [];
  for await (const file of glob.scan({ cwd: routesDir, onlyFiles: true })) {
    if (!file.includes('.test.')) files.push(file);
  }
  return files.sort();
}

/** Group scanned files by their directory ('' for the routes/ root), storing
 * basenames as list entries. */
function groupByDir(files: string[]): Map<string, string[]> {
  const byDir = new Map<string, string[]>();
  for (const file of [...files].sort()) {
    const slash = file.lastIndexOf('/');
    const dir = slash === -1 ? '' : file.slice(0, slash);
    const basename = slash === -1 ? file : file.slice(slash + 1);
    const list = byDir.get(dir) ?? [];
    list.push(basename);
    byDir.set(dir, list);
  }
  return byDir;
}

/** Direct subdirectories of `dir` that contain route files, sorted. */
function directSubdirs(byDir: Map<string, string[]>, dir: string): string[] {
  const prefix = dir === '' ? '' : `${dir}/`;
  const subs: string[] = [];
  for (const key of byDir.keys()) {
    if (key === dir || !key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (rest !== '' && !rest.includes('/')) subs.push(`${prefix}${rest}`);
  }
  return subs.sort();
}

/** Children of one directory: file routes first (index route first, then
 * alphabetical), then subdirectories (alphabetical, each wrapped by its
 * layout.tsx). */
function buildChildren(byDir: Map<string, string[]>, dir: string): RouteSpec[] {
  const own = byDir.get(dir) ?? [];
  const children: RouteSpec[] = [];

  const fileRoutes = own.filter(name => name !== 'layout.tsx').sort();
  const indexFirst = [
    ...fileRoutes.filter(name => name === 'index.tsx'),
    ...fileRoutes.filter(name => name !== 'index.tsx'),
  ];
  const prefix = dir === '' ? '' : `${dir}/`;
  for (const name of indexFirst) {
    const moduleName = name.replace(/\.tsx$/, '');
    children.push(
      moduleName === 'index'
        ? { index: true, importPath: `./routes/${prefix}index.js` }
        : { path: moduleName, importPath: `./routes/${prefix}${moduleName}.js` }
    );
  }

  for (const sub of directSubdirs(byDir, dir)) {
    if (!(byDir.get(sub) ?? []).includes('layout.tsx')) {
      throw new Error(`src/tui/routes/${sub}/ has no layout.tsx — the route convention requires one per directory`);
    }
    const segment = sub.slice(sub.lastIndexOf('/') + 1);
    children.push({
      path: segment,
      importPath: `./routes/${sub}/layout.js`,
      children: buildChildren(byDir, sub),
    });
  }

  return children;
}

/** Pure: nest scanned route files into the layout-wrapped route spec tree.
 * A root layout.tsx wraps everything; without one the routes stay flat. */
export function buildRouteTree(files: string[]): RouteSpec[] {
  const byDir = groupByDir(files);
  const children = buildChildren(byDir, '');
  if ((byDir.get('') ?? []).includes('layout.tsx')) {
    return [{ path: '/', importPath: './routes/layout.js', children }];
  }
  return children;
}

/** Stable variable name for a route module import:
 * './routes/remotes/list.js' → 'route_remotes_list'. */
function moduleVar(importPath: string): string {
  const name = importPath.replace('./routes/', '').replace(/\.js$/, '');
  return `route_${name.replaceAll(/[^a-zA-Z0-9]/g, '_')}`;
}

/** Unique import specifiers of every route module in the tree. */
function collectImports(specs: RouteSpec[]): string[] {
  const paths: string[] = [];
  for (const spec of specs) {
    paths.push(spec.importPath);
    if (spec.children !== undefined) paths.push(...collectImports(spec.children));
  }
  return [...new Set(paths)].sort();
}

/** Emit the defineRoute call for one spec (prettier-shaped, es5 commas). */
function emitSpec(spec: RouteSpec, indent: string): string[] {
  const selector = spec.index ? 'index: true' : `path: '${spec.path}'`;
  const moduleRef = moduleVar(spec.importPath);
  if (spec.children === undefined) {
    return [`${indent}defineRoute({ ${selector}, module: ${moduleRef} }),`];
  }
  return [
    `${indent}defineRoute({`,
    `${indent}  ${selector},`,
    `${indent}  module: ${moduleRef},`,
    `${indent}  children: [`,
    ...emitSpecs(spec.children, `${indent}    `),
    `${indent}  ],`,
    `${indent}}),`,
  ];
}

function emitSpecs(specs: RouteSpec[], indent: string): string[] {
  return specs.flatMap(spec => emitSpec(spec, indent));
}

/** Pure: emit the full generated module text for a route spec tree. */
export function emitRouteModule(specs: RouteSpec[]): string {
  const defineRoutePath = './shared/lib/route-tree.js';
  const lines: string[] = [
    '// routes.generated.ts — GENERATED FILE, DO NOT EDIT.',
    '// Regenerate with: bun run generate:routes',
    '// Source of truth: the file convention in src/tui/routes/ (layout.tsx wraps its',
    '// siblings, index.tsx is the index route, other name.tsx are child routes).',
    "// Handles are read at runtime from each module's `routeMeta` export.",
    "import type { RouteObject } from 'react-router';",
    '',
    // Internal imports sorted by specifier: route modules use namespace
    // imports (default + routeMeta must both be reachable at runtime)
    ...[...collectImports(specs), defineRoutePath]
      .sort()
      .map(path =>
        path === defineRoutePath
          ? `import { defineRoute } from '${path}';`
          : `import * as ${moduleVar(path)} from '${path}';`
      ),
    '',
    'export const routeTree: RouteObject[] = [',
    ...emitSpecs(specs, '  '),
    '];',
    '',
  ];
  return lines.join('\n');
}

function countRoutes(specs: RouteSpec[]): number {
  return specs.reduce((sum, spec) => sum + 1 + (spec.children !== undefined ? countRoutes(spec.children) : 0), 0);
}

async function main(): Promise<void> {
  const files = await scanRouteFiles(ROUTES_DIR);
  const specs = buildRouteTree(files);
  writeFileSync(OUTPUT_FILE, emitRouteModule(specs));
  console.log(`generated ${OUTPUT_FILE} (${countRoutes(specs)} routes from ${files.length} route files)`);
}

if (import.meta.main) void main();
