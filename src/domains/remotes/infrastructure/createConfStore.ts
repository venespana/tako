// createConfStore.ts — INFRASTRUCTURE factory: the sole construction point of
// the `conf` store (Port/Adapter Isolation, remote-connection-management):
// "infrastructure MUST provide the sole ssh2/conf adapters; application and
// CLI MUST NOT import ssh2 or conf directly." Composition roots wire domain
// adapters over this store and never import the `conf` package themselves.
import Conf from 'conf';

/** Minimal structural surface the remotes adapters consume. */
export type ConfStore = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
};

export function createConfStore(): ConfStore {
  return new Conf({ projectName: 'tako' });
}
