// route-tree.test.ts — Unit tests for the route-tree infrastructure helpers.
import { describe, expect, it } from 'vitest';

import { defineRoute, hasShowLogo } from './route-tree.js';
import type { RouteModule } from './route-tree.js';

const Screen = (): null => null;

const moduleWith = (routeMeta?: RouteModule['routeMeta']): RouteModule => ({
  default: Screen,
  ...(routeMeta === undefined ? {} : { routeMeta }),
});

describe('defineRoute', () => {
  it('builds a path route with component and handle', () => {
    const route = defineRoute({ path: 'remotes', module: moduleWith({ showLogo: true, menu: 'submenu' }) });

    expect(route).toMatchObject({ path: 'remotes', Component: Screen, handle: { showLogo: true, menu: 'submenu' } });
  });

  it('builds an index route', () => {
    const route = defineRoute({ index: true, module: moduleWith({ showLogo: true, menu: 'home' }) });

    expect(route).toMatchObject({ index: true, Component: Screen, handle: { showLogo: true, menu: 'home' } });
    expect(route.path).toBeUndefined();
  });

  it('defaults the handle to {} when routeMeta is absent', () => {
    const route = defineRoute({ path: 'doctor', module: moduleWith() });

    expect(route.handle).toEqual({});
  });

  it('nests children under the route', () => {
    const child = defineRoute({ path: 'list', module: moduleWith() });
    const route = defineRoute({ path: 'remotes', module: moduleWith(), children: [child] });

    expect(route.children).toEqual([child]);
  });
});

describe('hasShowLogo', () => {
  it('is true when any match in the chain opts in', () => {
    const matches = [{ handle: {} }, { handle: { showLogo: true, menu: 'submenu' } }, { handle: {} }];

    expect(hasShowLogo(matches)).toBe(true);
  });

  it('is false with no handles or only explicit false', () => {
    expect(hasShowLogo([{ handle: { showLogo: false } }])).toBe(false);
    expect(hasShowLogo([{ handle: undefined }])).toBe(false);
    expect(hasShowLogo([])).toBe(false);
  });
});
