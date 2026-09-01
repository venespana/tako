// generate-routes.test.ts — Unit tests for the pure route-generator functions
// (tree building + emission), imported from scripts/generate-routes.ts. The
// CLI scan (Bun.Glob) is exercised by actually running
// `bun run generate:routes`; it is not imported here.
import { describe, it, expect } from 'vitest';

import { buildRouteTree, emitRouteModule } from '../../../scripts/generate-routes.js';

const FILES = [
  'index.tsx',
  'layout.tsx',
  'doctor.tsx',
  'logs.tsx',
  'status.tsx',
  'cleanup.tsx',
  'remotes/layout.tsx',
  'remotes/add.tsx',
  'remotes/list.tsx',
  'remotes/rm.tsx',
  'remotes/use.tsx',
  'remotes/test.tsx',
];

describe('buildRouteTree', () => {
  it('wraps all routes in the root layout', () => {
    const tree = buildRouteTree(FILES);

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ path: '/', importPath: './routes/layout.js' });
    expect(tree[0]?.children).toHaveLength(6);
  });

  it('marks index.tsx as the index route and siblings as path routes', () => {
    const children = buildRouteTree(FILES)[0]?.children ?? [];

    expect(children[0]).toEqual({ index: true, importPath: './routes/index.js' });
    expect(children.find(c => c.path === 'doctor')).toMatchObject({ importPath: './routes/doctor.js' });
  });

  it('nests remotes children under the remotes layout, sorted', () => {
    const remotes = buildRouteTree(FILES)[0]?.children?.find(c => c.path === 'remotes');

    expect(remotes?.importPath).toBe('./routes/remotes/layout.js');
    expect(remotes?.children?.map(c => c.path)).toEqual(['add', 'list', 'rm', 'test', 'use']);
    expect(remotes?.children?.map(c => c.importPath)).toEqual([
      './routes/remotes/add.js',
      './routes/remotes/list.js',
      './routes/remotes/rm.js',
      './routes/remotes/test.js',
      './routes/remotes/use.js',
    ]);
  });

  it('is deterministic regardless of input order (idempotent codegen)', () => {
    expect(buildRouteTree([...FILES].reverse())).toEqual(buildRouteTree(FILES));
  });

  it('rejects a subdirectory without layout.tsx', () => {
    expect(() => buildRouteTree(['sub/page.tsx'])).toThrow(/layout\.tsx/);
  });

  it('stays flat when the root has no layout.tsx', () => {
    const tree = buildRouteTree(['index.tsx', 'doctor.tsx']);

    expect(tree).toEqual([
      { index: true, importPath: './routes/index.js' },
      { path: 'doctor', importPath: './routes/doctor.js' },
    ]);
  });
});

describe('emitRouteModule', () => {
  it('emits a stable module with imports and the typed route tree', () => {
    const out1 = emitRouteModule(buildRouteTree(FILES));
    const out2 = emitRouteModule(buildRouteTree([...FILES].reverse()));

    expect(out1).toBe(out2);
    expect(out1).toContain('GENERATED FILE, DO NOT EDIT');
    expect(out1).toContain('export const routeTree: RouteObject[] = [');
    expect(out1).toContain("import { defineRoute } from './shared/lib/route-tree.js';");
    expect(out1).toContain("import * as route_remotes_list from './routes/remotes/list.js';");
    expect(out1).toContain('defineRoute({ index: true, module: route_index }),');
    expect(out1).toContain("path: 'remotes',");
  });
});
