// routes.test.tsx — Unit tests for the app route table (ROUTE_TABLE).
import { describe, it, expect } from 'vitest';
import { ROUTE_TABLE, isAppRoute } from './routes.js';
import type { RouteName } from './routes.js';

const ALL_ROUTES: RouteName[] = [
  'home',
  'remotes',
  'remotes.add',
  'remotes.list',
  'remotes.rm',
  'remotes.use',
  'remotes.test',
  'doctor',
  'logs',
  'status',
  'cleanup',
];

const LOGO_ROUTES = new Set<RouteName>([
  'home',
  'remotes',
  'remotes.add',
  'remotes.list',
  'remotes.rm',
  'remotes.use',
  'remotes.test',
]);

const NO_LOGO_ROUTES = new Set<RouteName>(['doctor', 'logs', 'status', 'cleanup']);

describe('ROUTE_TABLE', () => {
  it('contains all 11 canonical routes', () => {
    for (const route of ALL_ROUTES) {
      expect(ROUTE_TABLE).toHaveProperty(route);
    }
  });

  it('showLogo is true for home and remotes.* routes', () => {
    for (const route of LOGO_ROUTES) {
      expect(ROUTE_TABLE[route]?.showLogo).toBe(true);
    }
  });

  it('showLogo is false for doctor/logs/status/cleanup', () => {
    for (const route of NO_LOGO_ROUTES) {
      expect(ROUTE_TABLE[route]?.showLogo).toBe(false);
    }
  });

  it('each route has a Screen function', () => {
    for (const route of ALL_ROUTES) {
      expect(typeof ROUTE_TABLE[route]?.Screen).toBe('function');
    }
  });
});

describe('isAppRoute', () => {
  it('accepts every canonical route', () => {
    for (const route of ALL_ROUTES) {
      expect(isAppRoute(route)).toBe(true);
    }
  });

  it('rejects unknown route strings', () => {
    expect(isAppRoute('remotes.nope')).toBe(false);
    expect(isAppRoute('')).toBe(false);
    expect(isAppRoute('Home')).toBe(false);
  });
});
