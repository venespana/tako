// routes.generated.test.ts — Structure guard for the generated route tree:
// every route file must be wired with the right path, nesting, and handle.
// The generator's pure build/emit functions are tested in
// generate-routes.test.ts; this asserts the committed artifact.
import { describe, it, expect } from 'vitest';
import type { RouteObject } from 'react-router';

import { routeTree } from '../routes.generated.js';

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

  it('nests the five remotes children under the remotes layout', () => {
    const remotes = childByPath(root, 'remotes');
    expect(remotes?.children?.map(child => child.path)).toEqual(['add', 'list', 'rm', 'test', 'use']);
    for (const child of remotes?.children ?? []) {
      expect(typeof child.Component).toBe('function');
    }
  });

  it('carries handles: home + remotes submenu opt in, isolated routes do not', () => {
    const index = root.children?.find(child => child.index);
    expect(index?.handle).toEqual({ showLogo: true, menu: 'home' });
    expect(childByPath(root, 'remotes')?.handle).toEqual({ showLogo: true, menu: 'submenu' });
    // remotes children have no own handle — they inherit via the match chain
    for (const child of childByPath(root, 'remotes')?.children ?? []) {
      expect(child.handle).toEqual({});
    }
    for (const path of ['cleanup', 'doctor', 'logs', 'status']) {
      expect(childByPath(root, path)?.handle).toEqual({ showLogo: false });
    }
  });
});
