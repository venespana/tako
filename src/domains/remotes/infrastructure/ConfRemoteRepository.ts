// ConfRemoteRepository.ts — INFRASTRUCTURE adapter (sole conf consumer for remotes)
import type { RemoteRepository } from '../application/RemoteRepository.js';
import type { Remote, RemoteSummary } from '../domain/types.js';

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

  async list(): Promise<RemoteSummary[]> {
    const conf = this.getConf();
    const remotes = conf.get(NAMESPACE) as Record<string, Remote> | undefined;
    if (!remotes) return [];

    // Sorted by name so the selection list is stable across sessions.
    return Object.values(remotes)
      .map(remote => ({ name: remote.name, endpoint: `${remote.username}@${remote.host}:${remote.port}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
