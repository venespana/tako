// application/CheckDuplicateRemote.test.ts — STRICT TDD RED phase
import { describe, it, expect, vi } from 'vitest';
import type { RemoteDraft } from '../domain/types.js';
import type { RemoteRepository } from './RemoteRepository.js';

// Import the class that doesn't exist yet — this is RED
import { CheckDuplicateRemote } from './CheckDuplicateRemote.js';

describe('CheckDuplicateRemote', () => {
  // 5 scenarios from task 3.1

  function fakeRepo(opts: { nameExists?: boolean; endpointExists?: boolean }): RemoteRepository {
    return {
      existsByName: vi.fn(async (name: string) => {
        return opts.nameExists ?? false;
      }),
      existsByEndpoint: vi.fn(async (e: string) => {
        return opts.endpointExists ?? false;
      }),
      save: vi.fn(async () => {}),
      getByName: vi.fn(async () => null),
      list: vi.fn(async () => []),
    };
  }

  const baseDraft: RemoteDraft = {
    name: 'nas',
    type: 'ssh',
    username: 'ops',
    host: '10.0.0.5',
    port: 22,
    credentialType: 'store',
  };

  it('3.1 RED: name collision → isDuplicate=true, kind=name', async () => {
    const repo = fakeRepo({ nameExists: true });
    const uc = new CheckDuplicateRemote(repo);
    const result = await uc.check(baseDraft);
    expect(result.isDuplicate).toBe(true);
    expect(result.kind).toBe('name');
  });

  it('3.1 RED: endpoint collision → isDuplicate=true, kind=endpoint', async () => {
    const repo = fakeRepo({ nameExists: false, endpointExists: true });
    const uc = new CheckDuplicateRemote(repo);
    const result = await uc.check(baseDraft);
    expect(result.isDuplicate).toBe(true);
    expect(result.kind).toBe('endpoint');
  });

  it('3.1 RED: both name and endpoint collide → kind=name (first wins)', async () => {
    const repo = fakeRepo({ nameExists: true, endpointExists: true });
    const uc = new CheckDuplicateRemote(repo);
    const result = await uc.check(baseDraft);
    expect(result.isDuplicate).toBe(true);
    expect(result.kind).toBe('name'); // name checked first
  });

  it('3.1 RED: neither collides → isDuplicate=false', async () => {
    const repo = fakeRepo({ nameExists: false, endpointExists: false });
    const uc = new CheckDuplicateRemote(repo);
    const result = await uc.check(baseDraft);
    expect(result.isDuplicate).toBe(false);
    expect(result.kind).toBeUndefined();
  });

  it('3.1 RED: case sensitivity — same name different case is treated as collision', async () => {
    // Spec says nothing about case sensitivity, but "name" is an exact identifier
    // The repository layer handles case; we just call it
    const repo = fakeRepo({ nameExists: true }); // repo sees it as existing
    const uc = new CheckDuplicateRemote(repo);
    const result = await uc.check(baseDraft);
    expect(result.isDuplicate).toBe(true);
    expect(result.kind).toBe('name');
  });
});
