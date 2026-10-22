#!/usr/bin/env bun
// scripts/generate-routes.ts — Codegen for the file-based route convention.
//
// Scans src/tui/app/routes/ and emits src/tui/app/routes.generated.ts:
// a typed react-router RouteObject[] that is committed to the repo (like
// TanStack's routeTree.gen.ts). Convention:
//   - layout.tsx  → layout route wrapping its sibling routes; optional per
//                   directory — required only when the path prefix needs
//                   shared chrome (the root layout.tsx wraps the whole app
//                   in the AppShell and stays)
//   - index.tsx   → index route at its layout's exact path
//   - name.tsx    → child route at /<dir>/name
//   - subdirectories map to nested path prefixes: a module-less parent
//     node (no import, react-router renders an implicit Outlet) unless
//     the subdirectory defines a layout.tsx (module-backed parent)
//
// Deterministic and idempotent: the scan is sorted and both the tree
// building and the emission are pure functions. Handles are NOT baked in
// here: the generated file uses namespace imports and defineRoute reads
// each module's `routeMeta` export at runtime. The committed artifact is
// structure-guarded by src/tui/app/routes.generated.test.ts.
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
  /** Import specifier of the route module, relative to the output file
   * (the generated file sits in src/tui/app/, the route shims in
   * src/tui/app/routes/). Absent for subdirectories without a layout.tsx:
   * they become module-less path-prefix parents. */
  importPath?: string;
  /** Child routes nested under this layout route. */
  children?: RouteSpec[];
}

const ROUTES_DIR = join('src', 'tui', 'app', 'routes');
const OUTPUT_FILE = join('src', 'tui', 'app', 'routes.generated.ts');

/** Collect route .tsx files under routesDir ('/'-separated, relative, sorted,
 * test files excluded). Bun-only: called from the CLI entry, never imported
 * by tests. */
async function scanRouteFiles(routesDir: string): Promise<string[]> {
  const glob = new Bun.Glob('**/*.tsx');
  const files = await Array.fromAsync(glob.scan({ cwd: routesDir, onlyFiles: true }));

  return files.filter(file => !file.includes('.test.')).sort();
}

/** Group scanned files by their directory ('' for the routes/ root), storing
 * basenames as list entries. */
function groupByDir(files: string[]): Map<string, string[]> {
  const byDir = new Map<string, string[]>();

  [...files].sort().forEach(file => {
    const slash = file.lastIndexOf('/');
    const dir = slash === -1 ? '' : file.slice(0, slash);
    const basename = slash === -1 ? file : file.slice(slash + 1);
    const list = byDir.get(dir) ?? [];
    list.push(basename);
    byDir.set(dir, list);
  });

  return byDir;
}

/** Direct subdirectories of `dir` that contain route files, sorted. */
function directSubdirs(byDir: Map<string, string[]>, dir: string): string[] {
  const prefix = dir === '' ? '' : `${dir}/`;

  return [...byDir.keys()]
    .filter(key => key !== dir && key.startsWith(prefix))
    .map(key => key.slice(prefix.length))
    .filter(rest => rest !== '' && !rest.includes('/'))
    .map(rest => `${prefix}${rest}`)
    .sort();
}

/** Children of one directory: file routes first (index route first, then
 * alphabetical), then subdirectories (alphabetical, each either wrapped by
 * its layout.tsx or emitted as a module-less path-prefix parent). */
function buildChildren(byDir: Map<string, string[]>, dir: string): RouteSpec[] {
  const own = byDir.get(dir) ?? [];
  const children: RouteSpec[] = [];

  const fileRoutes = own.filter(name => name !== 'layout.tsx').sort();
  const indexFirst = [
    ...fileRoutes.filter(name => name === 'index.tsx'),
    ...fileRoutes.filter(name => name !== 'index.tsx'),
  ];
  const prefix = dir === '' ? '' : `${dir}/`;

  indexFirst.forEach(name => {
    const moduleName = name.replace(/\.tsx$/, '');
    children.push(
      moduleName === 'index'
        ? { index: true, importPath: `./routes/${prefix}index.js` }
        : { path: moduleName, importPath: `./routes/${prefix}${moduleName}.js` }
    );
  });

  directSubdirs(byDir, dir).forEach(sub => {
    const segment = sub.slice(sub.lastIndexOf('/') + 1);
    const spec: RouteSpec = { path: segment, children: buildChildren(byDir, sub) };

    if ((byDir.get(sub) ?? []).includes('layout.tsx')) {
      spec.importPath = `./routes/${sub}/layout.js`;
    }

    children.push(spec);
  });

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
  const name = importPath.replace(/^\.\/routes\//, '').replace(/\.js$/, '');
  return `route_${name.replaceAll(/[^a-zA-Z0-9]/g, '_')}`;
}

/** Unique import specifiers of every route module in the tree. */
function collectImports(specs: RouteSpec[]): string[] {
  const paths: string[] = [];

  specs.forEach(spec => {
    if (spec.importPath !== undefined) paths.push(spec.importPath);

    if (spec.children !== undefined) paths.push(...collectImports(spec.children));
  });

  return [...new Set(paths)].sort();
}

/** Emit the defineRoute call for one spec (prettier-shaped, es5 commas).
 * Module-less specs (subdirectories without layout.tsx) emit path/index +
 * children only — no module reference. */
function emitSpec(spec: RouteSpec, indent: string): string[] {
  const selector = spec.index ? 'index: true' : `path: '${spec.path}'`;
  const moduleRef = spec.importPath !== undefined ? moduleVar(spec.importPath) : undefined;

  if (spec.children === undefined) {
    return [`${indent}defineRoute({ ${selector}, module: ${moduleRef} }),`];
  }

  return [
    `${indent}defineRoute({`,
    `${indent}  ${selector},`,
    ...(moduleRef === undefined ? [] : [`${indent}  module: ${moduleRef},`]),
    `${indent}  children: [`,
    ...emitSpecs(spec.children, `${indent}    `),
    `${indent}  ],`,
    `${indent}}),`,
  ];
}

function emitSpecs(specs: RouteSpec[], indent: string): string[] {
  return specs.flatMap(spec => emitSpec(spec, indent));
}

/** Sort import specifiers segment-wise, mirroring eslint-plugin-import-x's
 * alphabetize comparator ('../' parent paths sort after './' siblings, then
 * by segment, then by depth) so the generated file stays lint-clean. */
function byEslintImportOrder(a: string, b: string): number {
  const segmentsA = a.split('/');
  const segmentsB = b.split('/');
  const shared = Math.min(segmentsA.length, segmentsB.length);
  const firstDiff = segmentsA.findIndex((x, i) => i < shared && x !== segmentsB[i]);

  if (firstDiff >= 0) {
    const x = segmentsA[firstDiff]!;
    const y = segmentsB[firstDiff]!;
    const bothRelativeDots = (x === '.' || x === '..') && (y === '.' || y === '..');

    if (!bothRelativeDots) return x < y ? -1 : 1;
  }

  return segmentsA.length - segmentsB.length;
}

/** Pure: emit the full generated module text for a route spec tree. */
export function emitRouteModule(specs: RouteSpec[]): string {
  // The generated file sits in src/tui/app/, one level below src/tui/shared/.
  const defineRoutePath = '../shared/lib/route-tree.js';
  const lines: string[] = [
    '// routes.generated.ts — GENERATED FILE, DO NOT EDIT.',
    '// Regenerate with: bun run generate:routes',
    '// Source of truth: the file convention in src/tui/app/routes/ (layout.tsx wraps its',
    '// siblings when present, index.tsx is the index route, other name.tsx are child',
    '// routes; subdirectories are module-less path prefixes unless they define a',
    '// layout.tsx).',
    "// Handles are read at runtime from each module's `routeMeta` export.",
    "import type { RouteObject } from 'react-router';",
    '',
    // Internal imports sorted by specifier (eslint import-x/order shape):
    // route modules use namespace imports (default + routeMeta must both
    // be reachable at runtime)
    ...[...collectImports(specs), defineRoutePath]
      .sort(byEslintImportOrder)
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
