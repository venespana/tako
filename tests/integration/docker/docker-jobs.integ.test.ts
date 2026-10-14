// integration/docker/docker-jobs.integ.test.ts — docker jobs against a docker:dind sidecar (task 5.8)
//
// Real runtime harness for WU5: compose lifecycle runs through
// RunStackLifecycle + ComposeCliAdapter (host `docker compose` CLI pointed
// at the dind daemon via DOCKER_HOST); scoped prune runs through RunPrune +
// DockerodePruneAdapter with a client injected INTO the dind daemon, so the
// host daemon is never touched. Skips (never fails) when no docker daemon
// is available, per repo conventions.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Dockerode from 'dockerode';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RunPrune } from '../../../src/domains/docker/application/RunPrune.js';
import { RunStackLifecycle } from '../../../src/domains/docker/application/RunStackLifecycle.js';
import { stoppedContainersListFilters } from '../../../src/domains/docker/domain/prune-policy.js';
import { ComposeCliAdapter } from '../../../src/domains/docker/infrastructure/ComposeCliAdapter.js';
import { DockerodePruneAdapter } from '../../../src/domains/docker/infrastructure/DockerodePruneAdapter.js';

const COMPOSE_YAML = `services:
  sleeper:
    image: busybox:latest
    command: ["sleep", "300"]
`;

const DOCKERFILE = `FROM busybox:latest
RUN echo tako-cache-probe
`;

async function probeHostDaemon(): Promise<boolean> {
  try {
    await new Dockerode().ping();
    return true;
  } catch {
    return false;
  }
}

const daemonAvailable = await probeHostDaemon();

describe.skipIf(!daemonAvailable)('docker jobs — docker:dind sidecar', () => {
  let dind: StartedTestContainer;
  let dindClient: Dockerode;
  let dindHost: string;
  let stackDir: string;
  let previousDockerHost: string | undefined;

  beforeAll(async () => {
    dind = await new GenericContainer('docker:dind')
      .withPrivilegedMode()
      .withEnvironment({ DOCKER_TLS_CERTDIR: '' })
      .withExposedPorts(2375)
      .start();

    const port = dind.getMappedPort(2375);
    dindHost = `tcp://${dind.getHost()}:${port}`;
    dindClient = new Dockerode({ host: dind.getHost(), port });

    // The inner dockerd needs a moment to bind 2375.
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        await dindClient.ping();
        break;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    stackDir = mkdtempSync(join(tmpdir(), 'tako-stack-'));
    writeFileSync(join(stackDir, 'compose.yaml'), COMPOSE_YAML, 'utf8');
    writeFileSync(join(stackDir, 'Dockerfile'), DOCKERFILE, 'utf8');

    // dind ships no buildx → `docker build` falls back to the legacy builder,
    // which never populates /system/df BuildCache. Install it inside dind
    // (via the HOST daemon — the dind container lives there, so this exec
    // must NOT see DOCKER_HOST); later builds then record buildkit cache.
    const env = { ...process.env };
    delete env['DOCKER_HOST'];
    execFileSync('docker', ['exec', dind.getId(), 'apk', 'add', '--no-cache', 'docker-cli-buildx'], {
      env,
      timeout: 50_000,
    });

    // ComposeCliAdapter spawns the host CLI, which reads DOCKER_HOST from its env.
    previousDockerHost = process.env['DOCKER_HOST'];
    process.env['DOCKER_HOST'] = dindHost;
  }, 60_000);

  afterAll(async () => {
    if (previousDockerHost === undefined) delete process.env['DOCKER_HOST'];
    else process.env['DOCKER_HOST'] = previousDockerHost;
    if (stackDir) rmSync(stackDir, { recursive: true, force: true });
    if (dind) await dind.stop();
  }, 60_000);

  function runDockerCli(args: string[]): void {
    execFileSync('docker', args, {
      cwd: stackDir,
      env: { ...process.env, DOCKER_HOST: dindHost },
      timeout: 30_000,
    });
  }

  /** Runs a CLI call against the HOST daemon (no DOCKER_HOST) — for exec/cp into dind itself. */
  function runHostDockerCli(args: string[]): void {
    const env = { ...process.env };
    delete env['DOCKER_HOST'];
    execFileSync('docker', args, { env, timeout: 50_000 });
  }

  it('compose lifecycle: pull → up → restart → down apply; dry-run only plans', async () => {
    const lifecycle = new RunStackLifecycle(new ComposeCliAdapter());

    const pull = await lifecycle.execute({ op: 'pull', stackDir, mode: 'apply' });
    expect(pull.status).toBe('succeeded');
    const images = await dindClient.listImages({});
    expect(images.some(image => image.RepoTags?.includes('busybox:latest'))).toBe(true);

    const up = await lifecycle.execute({ op: 'up', stackDir, mode: 'apply' });
    expect(up.status).toBe('succeeded');
    const running = await dindClient.listContainers({});
    expect(running).toHaveLength(1);
    expect(running[0]?.State).toBe('running');

    const restart = await lifecycle.execute({ op: 'restart', stackDir, mode: 'apply' });
    expect(restart.status).toBe('succeeded');
    expect((await dindClient.listContainers({}))[0]?.State).toBe('running');

    const planned = await lifecycle.execute({ op: 'up', stackDir, mode: 'dry-run' });
    expect(planned).toEqual({
      mode: 'dry-run',
      op: 'up',
      stackDir,
      command: { argv: ['docker', 'compose', 'up', '-d'], cwd: stackDir },
      status: 'planned',
    });
    expect((await dindClient.listContainers({})).length).toBe(1);

    const down = await lifecycle.execute({ op: 'down', stackDir, mode: 'apply' });
    expect(down.status).toBe('succeeded');
    expect(await dindClient.listContainers({})).toHaveLength(0);
  });

  it('safe prune: dry-run lists and mutates nothing; apply removes scoped objects and keeps tagged images', async () => {
    runDockerCli(['compose', 'up', '-d']);
    runDockerCli(['compose', 'stop']);
    runDockerCli(['compose', 'pull']);
    // Buildkit build INSIDE dind (buildx installed in beforeAll), then remove
    // the probe image so the cache is orphaned — with the image present the
    // cache is InUse and a `builder prune -f` (what apply models) would
    // correctly skip it.
    runHostDockerCli(['cp', stackDir, `${dind.getId()}:/stack`]);
    runHostDockerCli([
      'exec',
      dind.getId(),
      'sh',
      '-c',
      'cd /stack && DOCKER_BUILDKIT=1 docker build -t tako-cache-probe . && docker rmi tako-cache-probe',
    ]);

    const stopped = await dindClient.listContainers({ all: true, filters: stoppedContainersListFilters() });
    expect(stopped.length).toBe(1);

    // Seed a dangling image: commit the stopped container WITHOUT a tag.
    await dindClient.getContainer(stopped[0]!.Id).commit({});
    const danglingBefore = await dindClient.listImages({ filters: { dangling: ['true'] } });
    expect(danglingBefore.length).toBeGreaterThanOrEqual(1);
    const seededDanglingIds = danglingBefore.map(image => image.Id);

    const prune = new RunPrune(new DockerodePruneAdapter(dindClient));
    const scopes = ['stopped-containers', 'dangling-images', 'build-cache'] as const;

    // Dry-run: full report, daemon untouched (spec agent-jobs#Dry-Run-First).
    const plan = await prune.execute({ scopes: [...scopes], mode: 'dry-run' });
    expect(plan.mode).toBe('dry-run');
    expect(plan.scopes).toEqual([...scopes]);
    expect(plan.entries.map(entry => entry.scope)).toEqual([...scopes]);
    expect(plan.entries.every(entry => entry.count >= 1)).toBe(true);
    const unusedCacheAtPlan = plan.entries.find(entry => entry.scope === 'build-cache')?.count ?? 0;
    expect(await dindClient.listContainers({ all: true, filters: stoppedContainersListFilters() })).toHaveLength(1);
    expect((await dindClient.listImages({ filters: { dangling: ['true'] } })).length).toBeGreaterThanOrEqual(1);
    expect(((await dindClient.df()) as { BuildCache: unknown[] }).BuildCache.length).toBeGreaterThanOrEqual(1);

    // Apply: same scopes, same validator, objects actually removed.
    const report = await prune.execute({ scopes: [...scopes], mode: 'apply' });
    expect(report.mode).toBe('apply');
    expect(report.entries.every(entry => entry.count >= 1)).toBe(true);
    expect(report.entries.every(entry => typeof entry.spaceReclaimedBytes === 'number')).toBe(true);

    expect(await dindClient.listContainers({ all: true, filters: stoppedContainersListFilters() })).toHaveLength(0);

    // Every SEEDED dangling image is gone. (The daemon may still surface
    // late-GC'd buildkit attestation manifests as dangling — that is outside
    // the prune's scope and racy, so we assert on the seeded IDs only.)
    const danglingAfter = (await dindClient.listImages({ filters: { dangling: ['true'] } })).map(image => image.Id);
    expect(danglingAfter).not.toEqual(expect.arrayContaining(seededDanglingIds));

    // ADR-0008 crown assertion: the TAGGED image survives a dangling prune.
    const imagesAfter = await dindClient.listImages({});
    expect(imagesAfter.some(image => image.RepoTags?.includes('busybox:latest'))).toBe(true);

    // Unused build-cache records strictly decrease. docker's `builder prune -f`
    // (what apply models) deliberately RETAINS Shared records — removing them
    // needs `-a`, and the `all` flag is structurally absent from the adapter.
    const dfAfter = (await dindClient.df()) as { BuildCache: { InUse?: boolean }[] };
    expect(dfAfter.BuildCache.filter(cache => cache['InUse'] !== true).length).toBeLessThan(unusedCacheAtPlan);
  });
});
