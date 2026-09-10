// menu-registry.ts — Declarative action registry for the home menu.
// Only implemented commands appear; unimplemented ones are excluded entirely.
// Submenu items (remotes) live in the router registry; home shows remotes as a single submenu entry.
// The registry is a module-level frozen constant so consumers can memoize on
// its identity (a fresh array per call would defeat React memo deps).

import type { ActionGroup } from './menu-items.js';

function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const REGISTRY: ActionGroup[] = deepFreeze([
  {
    id: 'local',
    label: 'Local',
    items: [
      {
        id: 'doctor',
        label: 'doctor',
        command: 'doctor',
        kind: 'action',
        enabledWhen: 'always',
        handlerKey: 'doctor',
        route: '/doctor',
      },
    ],
  },
  {
    id: 'remote',
    label: 'Remote',
    items: [
      {
        id: 'remotes',
        label: 'remotes',
        command: 'remotes',
        kind: 'submenu',
        submenu: ['select', 'add', 'delete'],
        enabledWhen: 'always',
        handlerKey: 'remotes',
        route: '/remotes',
      },
      {
        id: 'remote-logs',
        label: 'logs',
        command: 'logs',
        kind: 'action',
        enabledWhen: 'hasActiveRemote',
        handlerKey: 'logs',
        route: '/logs',
      },
      {
        id: 'remote-status',
        label: 'status',
        command: 'status',
        kind: 'action',
        enabledWhen: 'hasActiveRemote',
        handlerKey: 'status',
        route: '/status',
      },
      {
        id: 'remote-cleanup',
        label: 'cleanup',
        command: 'cleanup',
        kind: 'action',
        enabledWhen: 'hasActiveRemote',
        handlerKey: 'cleanup',
        route: '/cleanup',
      },
    ],
  },
  {
    id: 'config',
    label: 'Config',
    items: [],
  },
]);

/** Access the (stable, frozen) action registry. */
export function getRegistry(): ActionGroup[] {
  return REGISTRY;
}
