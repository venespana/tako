// DockerodePruneAdapter.ts — DockerPruner port via dockerode, scoped by construction (task 5.6)
//
// Sole consumer of dockerode in the docker domain. ADR-0008 structural
// safety (not validation): the dangling filter is pinned into BOTH image
// calls, `pruneBuilder` receives NO options (the `all` flag is absent from
// its option type), and the scope switch is exhaustive over the closed
// union — there is no code path that can express `image prune -af` or a
// volume prune. The container prune endpoint is stopped-only by docker's
// own semantics. A scope failure does NOT discard the other scopes: every
// entry settles, and the failed one carries an `error` marker so the run
// report shows exactly what was (and was not) applied.

import Dockerode from 'dockerode';

import type { DockerPruner } from '../application/RunPrune.js';
import { dockerPruneFilters, stoppedContainersListFilters } from '../domain/prune-policy.js';
import type { DockerFilters, PruneItem, PruneScope, PruneScopeReport } from '../domain/types.js';

/**
 * Structural slice of the docker API this adapter consumes. Typed against
 * @types/dockerode; `df()` is untyped upstream so it stays `unknown` and is
 * normalized with runtime guards below. Tests inject fakes; the dind
 * integration injects a client pointed at the dind daemon.
 */
export interface DockerPruneClient {
  listContainers(options?: Dockerode.ContainerListOptions): Promise<Dockerode.ContainerInfo[]>;
  listImages(options?: Dockerode.ListImagesOptions): Promise<Dockerode.ImageInfo[]>;
  df(): Promise<unknown>;
  pruneContainers(): Promise<Dockerode.PruneContainersInfo>;
  /** Options carry ONLY filters — a dangling prune cannot gain an `-a` flag through them. */
  pruneImages(options: { filters: DockerFilters }): Promise<Dockerode.PruneImagesInfo>;
  /** No options at all: `all` (the `-a` of `builder prune`) is unnameable here. */
  pruneBuilder(): Promise<Dockerode.PruneBuilderInfo>;
}

/** Build-cache prune answer: `CachesDeleted` ships on the wire but is missing from @types. */
export type PruneBuilderInfoWithCaches = Dockerode.PruneBuilderInfo & { CachesDeleted?: string[] | number };

/** One entry of the `BuildCache` array from GET /system/df (untyped upstream). */
interface BuildCacheEntry {
  readonly ID?: unknown;
  readonly Type?: unknown;
  readonly InUse?: unknown;
  readonly Size?: unknown;
}

/** DockerPruner port implementation — see application/RunPrune.ts. */
export class DockerodePruneAdapter implements DockerPruner {
  private readonly client: DockerPruneClient;

  constructor(client: DockerPruneClient = new Dockerode()) {
    this.client = client;
  }

  async plan(scopes: readonly PruneScope[]): Promise<PruneScopeReport[]> {
    return this.#settleAll(scopes, scope => this.planScope(scope));
  }

  async apply(scopes: readonly PruneScope[]): Promise<PruneScopeReport[]> {
    return this.#settleAll(scopes, scope => this.applyScope(scope));
  }

  /**
   * Fan out per scope but NEVER discard executed work: a rejected scope
   * settles into an error-marked report while the others keep their results.
   */
  async #settleAll(
    scopes: readonly PruneScope[],
    run: (scope: PruneScope) => Promise<PruneScopeReport>
  ): Promise<PruneScopeReport[]> {
    const settled = await Promise.allSettled(scopes.map(scope => run(scope)));
    return settled.map((outcome, index) => {
      const scope = scopes[index]!;

      if (outcome.status === 'fulfilled') {
        return outcome.value;
      }

      const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      return { scope, items: [], count: 0, error: message };
    });
  }

  private async planScope(scope: PruneScope): Promise<PruneScopeReport> {
    switch (scope) {
      case 'stopped-containers': {
        const containers = await this.client.listContainers({
          all: true,
          filters: stoppedContainersListFilters(),
        });
        return {
          scope,
          items: containers.map(container => {
            const name = container.Names[0] ?? '';
            return {
              id: container.Id,
              description: name ? `${name} (${container.Image})` : `(${container.Image})`,
            };
          }),
          count: containers.length,
        };
      }
      case 'dangling-images': {
        // The dangling filter is pinned — this listing can never return tagged images.
        const images = await this.client.listImages({ filters: dockerPruneFilters('dangling-images') });
        return {
          scope,
          items: images.map(image => ({ id: image.Id, description: '<none>:<none>' })),
          count: images.length,
        };
      }
      case 'build-cache': {
        const df = (await this.client.df()) as { BuildCache?: unknown };
        const caches = Array.isArray(df['BuildCache']) ? (df['BuildCache'] as BuildCacheEntry[]) : [];
        // A plan is advisory: exclude only PROVABLY in-use entries; the apply call is the real gate.
        const unused = caches.filter(cache => cache['InUse'] !== true && typeof cache['ID'] === 'string');
        return {
          scope,
          items: unused.map(cache => ({
            id: cache['ID'] as string,
            description: typeof cache['Type'] === 'string' ? cache['Type'] : undefined,
          })),
          count: unused.length,
          spaceReclaimedBytes: unused.reduce(
            (sum, cache) => sum + (typeof cache['Size'] === 'number' ? cache['Size'] : 0),
            0
          ),
        };
      }
    }
  }

  private async applyScope(scope: PruneScope): Promise<PruneScopeReport> {
    switch (scope) {
      case 'stopped-containers': {
        // POST /containers/prune is stopped-only by docker semantics (ADR-0008 ✅).
        const result = await this.client.pruneContainers();
        const deleted = Array.isArray(result['ContainersDeleted']) ? result['ContainersDeleted'] : [];
        return {
          scope,
          items: deleted.map(id => ({ id })),
          count: deleted.length,
          spaceReclaimedBytes: result['SpaceReclaimed'],
        };
      }
      case 'dangling-images': {
        // The dangling filter is pinned into the call — `-af` is unrepresentable (ADR-0008 ✅).
        const result = await this.client.pruneImages({ filters: dockerPruneFilters('dangling-images') });
        const entries = Array.isArray(result['ImagesDeleted']) ? result['ImagesDeleted'] : [];
        const items: PruneItem[] = [];

        entries.forEach(entry => {
          if (entry && typeof entry === 'object') {
            if ('Deleted' in entry && typeof entry['Deleted'] === 'string') {
              items.push({ id: entry['Deleted'], description: 'deleted' });
            } else if ('Untagged' in entry && typeof entry['Untagged'] === 'string') {
              items.push({ id: entry['Untagged'], description: 'untagged' });
            }
          }
        });

        return { scope, items, count: items.length, spaceReclaimedBytes: result['SpaceReclaimed'] };
      }
      case 'build-cache': {
        // No options passed: `all` is structurally absent — this is `docker builder prune -f` (ADR-0008 ✅).
        const result = (await this.client.pruneBuilder()) as PruneBuilderInfoWithCaches;
        const caches = result['CachesDeleted'];
        const items: PruneItem[] = Array.isArray(caches)
          ? caches.filter((id): id is string => typeof id === 'string').map(id => ({ id }))
          : [];
        return {
          scope,
          items,
          count: items.length > 0 ? items.length : typeof caches === 'number' ? caches : 0,
          spaceReclaimedBytes: result['SpaceReclaimed'],
        };
      }
    }
  }
}
