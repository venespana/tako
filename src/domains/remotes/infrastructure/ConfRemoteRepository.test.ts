// infrastructure/ConfRemoteRepository.test.ts — STRICT TDD RED phase
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Remote, RemoteDraft } from '../domain/types.js';
import type { RemoteRepository } from '../application/RemoteRepository.js';

// RED: import the class that doesn't exist yet
import { ConfRemoteRepository } from './ConfRemoteRepository.js';

function createMockConf(initialStore: Record<string, unknown> = {}) {
  let store = { ...initialStore };
  return {
    get: vi.fn((key: string) => {
      const keys = key.split('.');
      let val: unknown = store;
      for (const k of keys) {
        val = (val as Record<string, unknown>)?.[k];
      }
      return val;
    }),
    set: vi.fn((key: string, value: unknown) => {
      const keys = key.split('.');
      const lastKey = keys.pop()!;
      let obj: Record<string, unknown> = store;
      for (const k of keys) {
        if (!(k in obj)) obj[k] = {};
        obj = obj[k] as Record<string, unknown>;
      }
      obj[lastKey] = value;
    }),
    has: vi.fn((key: string) => {
      const keys = key.split('.');
      let val: unknown = store;
      for (const k of keys) {
        val = (val as Record<string, unknown>)?.[k];
        if (val === undefined) return false;
      }
      return val !== undefined;
    }),
    _getStore: () => store,
    _reset: (newStore: Record<string, unknown> = {}) => {
      store = newStore;
    },
  };
}

const baseRemote: Remote = {
  name: 'nas',
  type: 'ssh',
  username: 'ops',
  host: '10.0.0.5',
  port: 22,
  credentialType: 'store',
  obfuscatedPassword: 'encrypted-hunter2',
};

describe('ConfRemoteRepository', () => {
  describe('existsByName', () => {
    it('4.3 RED: returns true when remote with same name exists', async () => {
      const mockConf = createMockConf({
        remotes: {
          nas: baseRemote,
        },
      });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const exists = await repo.existsByName('nas');
      expect(exists).toBe(true);
    });

    it('4.3 RED: returns false when no remote with that name exists', async () => {
      const mockConf = createMockConf({
        remotes: {
          nas: baseRemote,
        },
      });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const exists = await repo.existsByName('webserver');
      expect(exists).toBe(false);
    });

    it('4.3 RED: returns false when no remotes exist at all', async () => {
      const mockConf = createMockConf({});

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const exists = await repo.existsByName('nas');
      expect(exists).toBe(false);
    });
  });

  describe('existsByEndpoint', () => {
    it('4.3 RED: returns true when remote with same endpoint exists', async () => {
      const mockConf = createMockConf({
        remotes: {
          nas: baseRemote,
        },
      });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      // Default port 22 → endpoint is 'ops@10.0.0.5:22'
      const exists = await repo.existsByEndpoint('ops@10.0.0.5:22');
      expect(exists).toBe(true);
    });

    it('4.3 RED: returns false when no remote with that endpoint exists', async () => {
      const mockConf = createMockConf({
        remotes: {
          nas: baseRemote,
        },
      });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const exists = await repo.existsByEndpoint('ops@10.0.0.10:22');
      expect(exists).toBe(false);
    });

    it('4.3 RED: different port on same host is different endpoint', async () => {
      const mockConf = createMockConf({
        remotes: {
          nas: { ...baseRemote, port: 22 },
        },
      });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const exists = await repo.existsByEndpoint('ops@10.0.0.5:2222');
      expect(exists).toBe(false);
    });

    it('4.3 RED: same host/port but different user is different endpoint', async () => {
      const mockConf = createMockConf({
        remotes: {
          nas: baseRemote,
        },
      });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const exists = await repo.existsByEndpoint('admin@10.0.0.5:22');
      expect(exists).toBe(false);
    });

    it('4.3 RED: no shadowing of unrelated keys', async () => {
      const mockConf = createMockConf({
        remotes: {
          nas: baseRemote,
        },
        otherData: 'should not affect',
      });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const exists = await repo.existsByEndpoint('admin@10.0.0.5:22');
      expect(exists).toBe(false);
    });
  });

  describe('save', () => {
    it('4.3 RED: saves remote under remotes.<name>', async () => {
      const mockConf = createMockConf({});

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      await repo.save(baseRemote);

      expect(mockConf.set).toHaveBeenCalledWith('remotes.nas', baseRemote);
    });

    it('4.3 RED: multiple remotes are stored separately', async () => {
      const mockConf = createMockConf({});

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      await repo.save(baseRemote);
      await repo.save({
        name: 'webserver',
        type: 'ssh',
        username: 'admin',
        host: '10.0.0.10',
        port: 2222,
        credentialType: 'ssh-key',
        keyPath: '/home/admin/.ssh/id_rsa',
      });

      const store = mockConf._getStore();
      expect(store.remotes).toHaveProperty('nas');
      expect(store.remotes).toHaveProperty('webserver');
      expect(store.remotes).not.toHaveProperty('other');
    });
  });

  describe('getByName', () => {
    it('2.3 RED: found — returns the full persisted Remote record', async () => {
      const mockConf = createMockConf({ remotes: { nas: baseRemote } });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const remote = await repo.getByName('nas');

      expect(remote).toEqual(baseRemote);
    });

    it('2.3 RED: not found — returns null without throwing', async () => {
      const mockConf = createMockConf({ remotes: { nas: baseRemote } });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      await expect(repo.getByName('ghost')).resolves.toBeNull();
    });

    it('2.3 RED: not found when no remotes exist at all', async () => {
      const mockConf = createMockConf({});

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      await expect(repo.getByName('nas')).resolves.toBeNull();
    });

    it('2.3 RED: legacy store-without-password normalizes to interactive on read', async () => {
      const legacy: Remote = {
        name: 'nas',
        type: 'ssh',
        username: 'ops',
        host: '10.0.0.5',
        port: 22,
        credentialType: 'store',
        obfuscatedPassword: undefined,
      };
      const mockConf = createMockConf({ remotes: { nas: legacy } });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const remote = await repo.getByName('nas');

      expect(remote?.credentialType).toBe('interactive');
    });

    it('2.3 RED: persisted bytes unchanged — getByName does not rewrite the stored entry', async () => {
      const legacy: Remote = {
        name: 'nas',
        type: 'ssh',
        username: 'ops',
        host: '10.0.0.5',
        port: 22,
        credentialType: 'store',
        obfuscatedPassword: undefined,
      };
      const mockConf = createMockConf({ remotes: { nas: legacy } });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      await repo.getByName('nas');

      expect(mockConf.set).not.toHaveBeenCalled();
      const storeRemotes = mockConf._getStore().remotes as Record<string, Remote>;
      expect(storeRemotes['nas']?.credentialType).toBe('store');
    });

    it('2.3 RED: store-with-password is returned as-is (normalization no-op)', async () => {
      const mockConf = createMockConf({ remotes: { nas: baseRemote } });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const remote = await repo.getByName('nas');

      expect(remote?.credentialType).toBe('store');
      expect(remote?.obfuscatedPassword).toBe('encrypted-hunter2');
    });
  });

  describe('list', () => {
    it('returns name + endpoint summaries sorted by name', async () => {
      const mockConf = createMockConf({
        remotes: {
          webserver: {
            name: 'webserver',
            type: 'ssh',
            username: 'admin',
            host: '10.0.0.10',
            port: 2222,
            credentialType: 'ssh-key',
            keyPath: '/home/admin/.ssh/id_rsa',
          },
          nas: baseRemote,
        },
      });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const summaries = await repo.list();

      expect(summaries).toEqual([
        { name: 'nas', endpoint: 'ops@10.0.0.5:22' },
        { name: 'webserver', endpoint: 'admin@10.0.0.10:2222' },
      ]);
    });

    it('returns an empty list when no remotes are configured', async () => {
      const mockConf = createMockConf({});

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const summaries = await repo.list();

      expect(summaries).toEqual([]);
    });

    it('does not leak stored credentials into summaries', async () => {
      const mockConf = createMockConf({
        remotes: { nas: baseRemote },
      });

      const repo = new ConfRemoteRepository(mockConf as unknown as RemoteRepository);

      const summaries = await repo.list();

      expect(summaries[0]).not.toHaveProperty('obfuscatedPassword');
      expect(JSON.stringify(summaries)).not.toContain('encrypted-hunter2');
    });
  });
});
