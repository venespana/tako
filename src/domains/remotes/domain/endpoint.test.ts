// domain/endpoint.test.ts — STRICT TDD RED phase
import { describe, it, expect } from 'vitest';
import type { RemoteDraft } from './types.js';

// Import the function that doesn't exist yet — this is RED
import { toEndpoint } from './endpoint.js';

describe('toEndpoint', () => {
  it('1.2 RED: standard port 22 is included explicitly', () => {
    const draft: RemoteDraft = {
      name: 'nas',
      type: 'ssh',
      username: 'ops',
      host: '10.0.0.5',
      port: 22,
      credentialType: 'store',
    };
    expect(toEndpoint(draft)).toBe('ops@10.0.0.5:22');
  });

  it('1.2 RED: non-default port is included in output', () => {
    const draft: RemoteDraft = {
      name: 'nas',
      type: 'ssh',
      username: 'admin',
      host: '192.168.1.100',
      port: 2222,
      credentialType: 'ssh-key',
      keyPath: '/home/user/.ssh/id_rsa',
    };
    expect(toEndpoint(draft)).toBe('admin@192.168.1.100:2222');
  });

  it('1.2 RED: different user on same host+port is distinct endpoint', () => {
    const draft1: RemoteDraft = {
      name: 'server1',
      type: 'ssh',
      username: 'alice',
      host: 'example.com',
      port: 22,
      credentialType: 'store',
    };
    const draft2: RemoteDraft = {
      name: 'server2',
      type: 'ssh',
      username: 'bob',
      host: 'example.com',
      port: 22,
      credentialType: 'store',
    };
    expect(toEndpoint(draft1)).not.toBe(toEndpoint(draft2));
    expect(toEndpoint(draft1)).toBe('alice@example.com:22');
    expect(toEndpoint(draft2)).toBe('bob@example.com:22');
  });
});
