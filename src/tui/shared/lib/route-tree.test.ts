// route-tree.test.ts — Unit tests for the route-tree infrastructure helpers.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';

import { defineRoute, hasMenuHandle } from './route-tree.js';
import type { RouteModule } from './route-tree.js';

const Screen = (): null => null;

const moduleWith = (routeMeta?: RouteModule['routeMeta']): RouteModule => ({
  default: Screen,
  ...(routeMeta === undefined ? {} : { routeMeta }),
});

describe('defineRoute', () => {
  it('builds a path route with component and handle', () => {
    const route = defineRoute({ path: 'remotes', module: moduleWith({ menu: true }) });

    expect(route).toMatchObject({ path: 'remotes', Component: Screen, handle: { menu: true } });
  });

  it('builds an index route', () => {
    const route = defineRoute({ index: true, module: moduleWith({ menu: true }) });

    expect(route).toMatchObject({ index: true, Component: Screen, handle: { menu: true } });
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

  it('propagates the module errorElement onto the built route (9.22)', () => {
    // Identity matters: the generated tree mounts THIS element as the branch's
    // Ink-safe error boundary (never react-router's raw-text default).
    const errorElement = createElement(Screen);
    const route = defineRoute({ path: 'tasks', module: { default: Screen, errorElement } });

    expect(route.errorElement).toBe(errorElement);
  });

  it('leaves errorElement unset when the module declares none', () => {
    const route = defineRoute({ path: 'doctor', module: moduleWith() });

    expect(route.errorElement).toBeUndefined();
  });
});

describe('hasMenuHandle', () => {
  it('is true when any match in the chain declares a menu', () => {
    const matches = [{ handle: {} }, { handle: { menu: true } }, { handle: {} }];

    expect(hasMenuHandle(matches)).toBe(true);
    expect(hasMenuHandle([{ handle: { menu: true } }])).toBe(true);
  });

  it('is false with no handles or menu-less handles', () => {
    expect(hasMenuHandle([{ handle: {} }])).toBe(false);
    expect(hasMenuHandle([{ handle: undefined }])).toBe(false);
    expect(hasMenuHandle([])).toBe(false);
  });
});
