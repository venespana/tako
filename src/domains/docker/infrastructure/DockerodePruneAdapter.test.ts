// DockerodePruneAdapter.test.ts — scoped prune via a structural dockerode client (tasks 5.6, 5.7)
//
// ADR-0008 structural safety: the dangling filter is pinned into the image
// prune/list calls, the builder prune NEVER carries an `all` flag, and the
// scope switch is exhaustive over the closed union — there is no code path
// that can express `image prune -af` or a volume prune. These tests pin the
// calls made to the docker client and the report normalization.
import type Dockerode from 'dockerode';
import { describe, expect, it } from 'vitest';

import type { DockerPruneClient, PruneBuilderInfoWithCaches } from './DockerodePruneAdapter.js';
import { DockerodePruneAdapter } from './DockerodePruneAdapter.js';

interface RecordedCall {
  readonly method: string;
  readonly options: unknown;
}

/** Fake docker client: records every call, returns canned docker-shaped data.
 * Stored fixtures are partial, so returns cast up to the full dockerode types. */
class FakeDockerClient implements DockerPruneClient {
  readonly calls: RecordedCall[] = [];

  constructor(
    private readonly results: {
      containers?: { Id: string; Names: string[]; Image: string }[];
      images?: { Id: string; RepoTags?: string[] }[];
      df?: unknown;
      pruneContainers?: { ContainersDeleted: string[]; SpaceReclaimed: number };
      pruneImages?: { ImagesDeleted: { Untagged?: string; Deleted?: string }[]; SpaceReclaimed: number };
      pruneBuilder?: PruneBuilderInfoWithCaches;
    } = {}
  ) {}

  async listContainers(options?: { all?: boolean; filters?: Record<string, string[]> }) {
    this.calls.push({ method: 'listContainers', options });
    return (this.results.containers ?? []) as Dockerode.ContainerInfo[];
  }

  async listImages(options?: { all?: boolean; filters?: Record<string, string[]> }) {
    this.calls.push({ method: 'listImages', options });
    return (this.results.images ?? []) as Dockerode.ImageInfo[];
  }

  async df(): Promise<unknown> {
    this.calls.push({ method: 'df', options: undefined });
    return this.results.df ?? { BuildCache: [] };
  }

  async pruneContainers() {
    this.calls.push({ method: 'pruneContainers', options: undefined });
    return this.results.pruneContainers ?? { ContainersDeleted: [], SpaceReclaimed: 0 };
  }

  async pruneImages(options: { filters: Record<string, string[]> }) {
    this.calls.push({ method: 'pruneImages', options });
    return (this.results.pruneImages ?? { ImagesDeleted: [], SpaceReclaimed: 0 }) as Dockerode.PruneImagesInfo;
  }

  async pruneBuilder() {
    this.calls.push({ method: 'pruneBuilder', options: undefined });
    return this.results.pruneBuilder ?? { SpaceReclaimed: 0 };
  }
}

describe('DockerodePruneAdapter — dry-run plan lists, mutates nothing', () => {
  it('lists stopped containers with the domain status filters (all: true)', async () => {
    const client = new FakeDockerClient({
      containers: [
        { Id: 'c-long-id-1', Names: ['/plex'], Image: 'plexImage' },
        { Id: 'c-long-id-2', Names: [], Image: 'jellyfinImage' },
      ],
    });
    const entries = await new DockerodePruneAdapter(client).plan(['stopped-containers']);

    expect(client.calls.map(call => call.method)).toEqual(['listContainers']);
    expect(client.calls[0]?.options).toEqual({
      all: true,
      filters: { status: ['created', 'exited', 'dead'] },
    });
    expect(entries).toEqual([
      {
        scope: 'stopped-containers',
        items: [
          { id: 'c-long-id-1', description: '/plex (plexImage)' },
          { id: 'c-long-id-2', description: '(jellyfinImage)' },
        ],
        count: 2,
      },
    ]);
  });

  it('lists dangling images with the pinned dangling filter, tagging untagged ones', async () => {
    const client = new FakeDockerClient({
      images: [
        { Id: 'i-dangling-1', RepoTags: undefined },
        { Id: 'i-dangling-2', RepoTags: ['<none>:<none>'] },
      ],
    });
    const entries = await new DockerodePruneAdapter(client).plan(['dangling-images']);

    expect(client.calls.map(call => call.method)).toEqual(['listImages']);
    expect(client.calls[0]?.options).toEqual({ filters: { dangling: ['true'] } });
    expect(entries[0]?.items).toEqual([
      { id: 'i-dangling-1', description: '<none>:<none>' },
      { id: 'i-dangling-2', description: '<none>:<none>' },
    ]);
    expect(entries[0]?.count).toBe(2);
  });

  it('plans build cache from system df, restricted to unused entries, with a size estimate', async () => {
    const client = new FakeDockerClient({
      df: {
        BuildCache: [
          { ID: 'cache-unused', Type: 'exec.cachemount', InUse: false, Size: 100 },
          { ID: 'cache-inuse', Type: 'source.local', InUse: true, Size: 900 },
          { ID: 'cache-free', Type: 'filesystem', Size: 50 }, // InUse absent → treated as unused (only explicit InUse:true is excluded)
        ],
      },
    });
    const entries = await new DockerodePruneAdapter(client).plan(['build-cache']);

    expect(client.calls.map(call => call.method)).toEqual(['df']);
    expect(entries[0]?.items).toEqual([
      { id: 'cache-unused', description: 'exec.cachemount' },
      { id: 'cache-free', description: 'filesystem' },
    ]);
    expect(entries[0]?.spaceReclaimedBytes).toBe(150);
  });

  it('plans multiple scopes in order and never touches a prune endpoint', async () => {
    const client = new FakeDockerClient();
    const entries = await new DockerodePruneAdapter(client).plan([
      'dangling-images',
      'stopped-containers',
      'build-cache',
    ]);

    expect(entries.map(entry => entry.scope)).toEqual(['dangling-images', 'stopped-containers', 'build-cache']);
    expect(client.calls.map(call => call.method)).toEqual(['listImages', 'listContainers', 'df']);
  });
});

describe('DockerodePruneAdapter — apply is scoped and reports the same shape', () => {
  it('prunes containers (stopped-only endpoint) and maps deleted IDs', async () => {
    const client = new FakeDockerClient({
      pruneContainers: { ContainersDeleted: ['c-1', 'c-2'], SpaceReclaimed: 2048 },
    });
    const entries = await new DockerodePruneAdapter(client).apply(['stopped-containers']);

    expect(client.calls).toEqual([{ method: 'pruneContainers', options: undefined }]);
    expect(entries).toEqual([
      {
        scope: 'stopped-containers',
        items: [{ id: 'c-1' }, { id: 'c-2' }],
        count: 2,
        spaceReclaimedBytes: 2048,
      },
    ]);
  });

  it('image prune carries the dangling filter (all-images prune unrepresentable)', async () => {
    const client = new FakeDockerClient({
      pruneImages: {
        ImagesDeleted: [{ Deleted: 'i-layer' }, { Untagged: 'i-tag' }, {}],
        SpaceReclaimed: 4096,
      },
    });
    const entries = await new DockerodePruneAdapter(client).apply(['dangling-images']);

    const pruneCall = client.calls.find(call => call.method === 'pruneImages');
    expect(pruneCall?.options).toEqual({ filters: { dangling: ['true'] } });
    expect(entries[0]).toEqual({
      scope: 'dangling-images',
      items: [
        { id: 'i-layer', description: 'deleted' },
        { id: 'i-tag', description: 'untagged' },
      ],
      count: 2,
      spaceReclaimedBytes: 4096,
    });
  });

  it('builder prune passes no options at all — the all flag is structurally absent', async () => {
    const client = new FakeDockerClient({
      pruneBuilder: { SpaceReclaimed: 8192, CachesDeleted: ['cache-a', 'cache-b'] },
    });
    const entries = await new DockerodePruneAdapter(client).apply(['build-cache']);

    const pruneCall = client.calls.find(call => call.method === 'pruneBuilder');
    expect(pruneCall?.options).toBeUndefined();
    expect(entries[0]).toEqual({
      scope: 'build-cache',
      items: [{ id: 'cache-a' }, { id: 'cache-b' }],
      count: 2,
      spaceReclaimedBytes: 8192,
    });
  });

  it('normalizes a count-style CachesDeleted answer (older daemons)', async () => {
    const client = new FakeDockerClient({
      pruneBuilder: { SpaceReclaimed: 100, CachesDeleted: 7 },
    });
    const entries = await new DockerodePruneAdapter(client).apply(['build-cache']);

    expect(entries[0]?.items).toEqual([]);
    expect(entries[0]?.count).toBe(7);
  });

  it('applies multiple scopes in order, one prune endpoint per scope', async () => {
    const client = new FakeDockerClient();
    const entries = await new DockerodePruneAdapter(client).apply([
      'stopped-containers',
      'dangling-images',
      'build-cache',
    ]);

    expect(entries.map(entry => entry.scope)).toEqual(['stopped-containers', 'dangling-images', 'build-cache']);
    expect(client.calls.map(call => call.method)).toEqual(['pruneContainers', 'pruneImages', 'pruneBuilder']);
  });

  it('apply: a failing scope settles as an error-marked report; the others keep their results', async () => {
    class ThrowingBuilderClient extends FakeDockerClient {
      override async pruneBuilder(): Promise<PruneBuilderInfoWithCaches> {
        this.calls.push({ method: 'pruneBuilder', options: undefined });
        throw new Error('buildkit prune exploded');
      }
    }
    const client = new ThrowingBuilderClient({
      pruneImages: { ImagesDeleted: [{ Untagged: 'i-dangling' }], SpaceReclaimed: 10 },
    });

    const entries = await new DockerodePruneAdapter(client).apply(['dangling-images', 'build-cache']);

    // The already-executed scope keeps its full report...
    expect(entries[0]).toEqual({
      scope: 'dangling-images',
      items: [{ id: 'i-dangling', description: 'untagged' }],
      count: 1,
      spaceReclaimedBytes: 10,
    });
    // ...and the failed one is visible as an error, not silently discarded.
    expect(entries[1]?.scope).toBe('build-cache');
    expect(entries[1]?.error).toMatch(/buildkit prune exploded/);
    expect(entries[1]?.count).toBe(0);
  });

  it('plan: a failing scope also settles as an error-marked report', async () => {
    class ThrowingDfClient extends FakeDockerClient {
      override async df(): Promise<unknown> {
        this.calls.push({ method: 'df', options: undefined });
        throw new Error('df unavailable');
      }
    }
    const client = new ThrowingDfClient({
      images: [{ Id: 'i-dangling-1' }],
    });

    const entries = await new DockerodePruneAdapter(client).plan(['dangling-images', 'build-cache']);

    expect(entries[0]?.items).toEqual([{ id: 'i-dangling-1', description: '<none>:<none>' }]);
    expect(entries[1]?.scope).toBe('build-cache');
    expect(entries[1]?.error).toMatch(/df unavailable/);
  });
});
