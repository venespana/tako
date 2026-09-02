// routes.generated.test.ts — Structure guard for the generated route tree:
// every route file must be wired with the right path, nesting, and handle.
// This asserts the committed artifact produced by scripts/generate-routes.ts.
import { describe, it, expect } from 'vitest';
import type { RouteObject } from 'react-router';

import { routeTree } from './routes.generated.js';

function childByPath(route: RouteObject, path: string): RouteObject | undefined {
  return route.children?.find(child => !child.index && child.path === path);
}

describe('routeTree (generated)', () => {
  const root = routeTree[0]!;

  it('wraps everything in the root layout at "/"', () => {
    expect(routeTree).toHaveLength(1);
    expect(root.path).toBe('/');
    expect(typeof root.Component).toBe('function');
  });

  it('registers the home screen as the index route', () => {
    const index = root.children?.find(child => child.index);
    expect(index).toBeDefined();
    expect(typeof index?.Component).toBe('function');
  });

  it('registers all top-level paths', () => {
    for (const path of ['cleanup', 'doctor', 'logs', 'status', 'remotes']) {
      expect(childByPath(root, path)).toBeDefined();
    }
  });

  it('nests the remotes index + five command children under a module-less remotes prefix', () => {
    const remotes = childByPath(root, 'remotes');
    // No layout.tsx in routes/remotes/ → path prefix without a module:
    // no Component (react-router renders an implicit Outlet), no handle.
    expect(remotes).toBeDefined();
    expect(remotes?.Component).toBeUndefined();
    const children = remotes?.children ?? [];
    expect(children.find(child => child.index)).toBeDefined();
    expect(children.filter(child => !child.index).map(child => child.path)).toEqual([
      'add',
      'list',
      'rm',
      'test',
      'use',
    ]);
    for (const child of children) {
      expect(typeof child.Component).toBe('function');
    }
  });

  it('carries handles: menu pages flag their menu, command pages have none', () => {
    const index = root.children?.find(child => child.index);
    expect(index?.handle).toEqual({ menu: 'home' });

    // The '/remotes' prefix is module-less (no handle of its own); the
    // submenu flag lives on the '/remotes' index page. Command pages
    // carry no handle at all.
    const remotes = childByPath(root, 'remotes');
    expect(remotes?.handle).toBeUndefined();
    const remotesIndex = remotes?.children?.find(child => child.index);
    expect(remotesIndex?.handle).toEqual({ menu: 'submenu' });
    for (const child of remotes?.children?.filter(child => !child.index) ?? []) {
      expect(child.handle).toEqual({});
    }
    for (const path of ['cleanup', 'doctor', 'logs', 'status']) {
      expect(childByPath(root, path)?.handle).toEqual({});
    }
  });
});
