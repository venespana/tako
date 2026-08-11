// ConfRemoteRepository.ts — INFRASTRUCTURE adapter (sole conf consumer for remotes)
import type { RemoteRepository } from '../application/RemoteRepository.js';
import type { Remote } from '../domain/types.js';

const NAMESPACE = 'remotes';

export class ConfRemoteRepository implements RemoteRepository {
  constructor(private readonly conf: unknown) {
    // conf is any here because we only use get/set/has
    // In a full implementation, we'd type this more precisely
  }

  private getConf() {
    return this.conf as {
      get(key: string): unknown;
      set(key: string, value: unknown): void;
      has(key: string): boolean;
    };
  }

  async existsByName(name: string): Promise<boolean> {
    const conf = this.getConf();
    return conf.has(`${NAMESPACE}.${name}`);
  }

  async existsByEndpoint(endpoint: string): Promise<boolean> {
    const conf = this.getConf();
    // Scan all remotes and check if any has the same endpoint
    const remotes = conf.get(NAMESPACE) as Record<string, Remote> | undefined;
    if (!remotes) return false;

    for (const remote of Object.values(remotes)) {
      const remoteEndpoint = `${remote.username}@${remote.host}:${remote.port}`;
      if (remoteEndpoint === endpoint) {
        return true;
      }
    }
    return false;
  }

  async save(remote: Remote): Promise<void> {
    const conf = this.getConf();
    conf.set(`${NAMESPACE}.${remote.name}`, remote);
  }
}
