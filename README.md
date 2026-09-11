<p align="center">
  <img src="docs/assets/tako-logo.jpg" alt="Tako" width="200" />
</p>

<h1 align="center">Tako 🐙</h1>

<p align="center">
  <a href="https://github.com/venespana/tako/actions/workflows/ci.yml">
    <img src="https://github.com/venespana/tako/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" />
  </a>
  <img src="https://img.shields.io/badge/bun-%3E%3D1.1-000?logo=bun" alt="Bun >= 1.1" />
  <a href="docs/stack.md">
    <img
      src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white"
      alt="TypeScript: strict"
    />
  </a>
</p>

<p align="center">TUI for managing docker-compose-based homelabs over SSH.</p>

---

Tako is a TypeScript terminal application that manages docker-compose-based homelabs over SSH: an
interactive TUI (Ink + React) and a thin CLI behind one binary. It runs on Bun and ships as a single
compiled Linux binary.

## Features

- **Bootstrap of base stacks** — Caddy + AdGuard + Uptime Kuma + cloudflared, written to the server from
  templates embedded in the binary (`tako install`).
- **Deploy via tags** — diff the running stacks against the embedded templates and redeploy what changed
  (`tako update --host`).
- **Service status** — non-interactive table of stack status, for scripts and cron (`tako status`).
- **Live logs** — `docker compose logs` over SSH without opening the TUI, with `-f` to follow
  (`tako logs`).
- **Rollback** — redeploy a previous tag of a stack (`tako rollback`).
- **Cleanup** — safe prune: stopped containers, dangling images, build cache. Never touches volumes or
  images needed for rollback (`tako cleanup`).

## How it works

Tako runs on your PC and connects to your servers via SSH (VSCode Remote style). Servers expose nothing
new: management goes through SSH.

- **Clean host**: the server only carries Docker + the minimal pieces. Zero orchestrator on top
  (Coolify/Komodo/Portainer discarded).
- **Small specialized pieces**: each function (status, logs, deploy) covered by a lightweight tool.
- **SSH as the only transport**: nothing new exposed on the server.
- **Templates embedded in the binary**: the binary is the canonical source of base stacks; updating
  templates = updating the binary.

## Status

🚧 In design — pre-release. No usable release yet. See the [roadmap](docs/index.md#roadmap).

Once released, versions are cut automatically from `main`: every merge publishes a `vX.Y.Z` tag (taken
from `package.json`) and a GitHub Release with the compiled binary attached.

## Development

```bash
bun install                                       # install dependencies
bun run start                                     # run the TUI
bun run dev                                       # run the CLI with watch
bun run test && bun run typecheck && bun run lint # verify your work
```

Branching: `feature/<name>` for feature work, `fix/<name>` for quick fixes and hotfixes. Versioning:
every PR bumps `version` in `package.json` (see [Contributing](#contributing)).

## Contributing

- Every PR must bump the `version` field in `package.json`: patch for fixes, minor for features, major
  for breaking changes.
- A CI job ("Version bump") rejects PRs without a bump.
- Merges to `main` automatically tag `vX.Y.Z` and publish a GitHub Release with the binary.

## Documentation

- [Architecture](docs/architecture.md)
- [Technical stack](docs/stack.md)
- [CLI spec](docs/commands.md)
- [Testing strategy](docs/testing.md)
- [Distribution](docs/distribution.md)
- [Decisions (ADRs)](docs/decisions/)

## License

MIT. See [LICENSE](LICENSE).
