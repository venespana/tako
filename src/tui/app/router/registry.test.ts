// registry.test.ts — Unit tests for ROUTE_REGISTRY.
import { describe, it, expect } from 'vitest';
import { ROUTE_REGISTRY } from './registry.js';

const ALL_ROUTES = [
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
] as const;

const LOGO_ROUTES = new Set([
  'home',
  'remotes',
  'remotes.add',
  'remotes.list',
  'remotes.rm',
  'remotes.use',
  'remotes.test',
]);

const NO_LOGO_ROUTES = new Set(['doctor', 'logs', 'status', 'cleanup']);

describe('ROUTE_REGISTRY', () => {
  it('contains all 11 canonical routes', () => {
    for (const route of ALL_ROUTES) {
      expect(ROUTE_REGISTRY).toHaveProperty(route);
    }
  });

  it('showLogo is true for home and remotes.* routes', () => {
    for (const route of LOGO_ROUTES) {
      expect(ROUTE_REGISTRY[route]?.showLogo).toBe(true);
    }
  });

  it('showLogo is false for doctor/logs/status/cleanup', () => {
    for (const route of NO_LOGO_ROUTES) {
      expect(ROUTE_REGISTRY[route]?.showLogo).toBe(false);
    }
  });

  it('each route has a Screen function', () => {
    for (const route of ALL_ROUTES) {
      expect(typeof ROUTE_REGISTRY[route]?.Screen).toBe('function');
    }
  });
});
