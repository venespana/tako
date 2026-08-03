# Tako 🐙

TUI for managing docker-compose-based homelabs over SSH.

Tako runs on your PC and connects to your servers via SSH (VSCode Remote style). Servers expose nothing new: management goes through SSH. It supports bootstrap of base stacks (Caddy + AdGuard + Uptime Kuma + cloudflared), deploy via tags, service status, live logs, rollback, and cleanup.

## Status

🚧 In design. No usable release yet. See [roadmap](docs/index.md#roadmap).

## Philosophy

- **Clean host**: the server only carries Docker + the minimal pieces. Zero orchestrator on top (Coolify/Komodo/Portainer discarded).
- **Small specialized pieces**: each function (status, logs, deploy) covered by a lightweight tool.
- **SSH as the only transport**: nothing new exposed on the server.
- **Templates embedded in the binary**: the binary is the canonical source of base stacks.

## Documentation

- [Architecture](docs/architecture.md)
- [Technical stack](docs/stack.md)
- [CLI spec](docs/commands.md)
- [Testing strategy](docs/testing.md)
- [Distribution](docs/distribution.md)
- [Decisions (ADRs)](docs/decisions/)

## License

MIT. See [LICENSE](LICENSE).
