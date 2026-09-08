// registry.ts — Declarative action registry for the home menu.
// Only implemented commands appear; unimplemented ones are excluded entirely.

import type { ActionGroup } from './types.js';

export function getRegistry(): ActionGroup[] {
  return [
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
          submenu: ['add', 'list', 'rm', 'use', 'test'],
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
  ];
}
