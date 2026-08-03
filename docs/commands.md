# CLI Spec — Commands

Tako has 9 commands. The public contract is closed.

## Command set

```
tako                              # interactive TUI (default)
tako doctor                       # pre-flight check
tako install                      # bootstrap remote host
tako update [--host X]            # self-update or host update
tako remotes <add|list|rm|use|test>
tako status [--host X]            # non-interactive table
tako logs <stack> [--host X] [-f]
tako cleanup [--host X]           # safe prune
tako rollback <stack> [--to <tag>]
```

## Detail per command

### `tako` (default)

Launches the interactive TUI over the active remote. If no remote is configured, it offers a wizard.

### `tako doctor`

Pre-flight: checks that the host has an accessible docker daemon, compose v2, the `caddy` network, and base services available. **Only reports**, does not suggest fixes.

### `tako install`

Bootstrap of the remote host:
- Creates `~/.local/share/homelab/` (XDG, without sudo).
- Writes the `docker-compose.yml` of base stacks from the templates embedded in the binary.
- Creates the `caddy` network if it does not exist.
- Copies `.env.example` → `.env`.
- Installs the CLI cron (runs `tako cleanup` daily).
- Brings up stacks: `docker compose up -d`.

**Restriction**: does not install OS packages or escalate permissions. If docker is not available, it aborts with a clear message.

### `tako update`

- **Without `--host`**: self-update of the binary. Downloads the latest version from GitHub Releases according to platform.
- **With `--host X`**: diff of docker-composes between what runs on X vs the templates in the local binary. Redeploy of changed stacks.

### `tako remotes <subcommand>`

Connection management:
- `add <name>`: adds a remote (interactive wizard).
- `list`: lists configured remotes.
- `rm <name>`: removes a remote.
- `use <name>`: sets the active remote.
- `test <name>`: tests the connection.

Supported types:
- `local`: makes no connection, operates on the current host.
- `ssh user@host + password`.
- `ssh user@host + path to private key`.

Both auth methods at the same level. Credential storage with a secure format.

### `tako status [--host X]`

Non-interactive table with stack status. For scripts/cron.

### `tako logs <stack> [--host X] [-f]`

`docker compose logs` via SSH, without opening the TUI. `-f` to follow.

### `tako cleanup [--host X]`

Safe prune:
- `docker container prune -f` (stopped containers).
- `docker image prune -f` (**dangling** only).
- `docker builder prune -f` (build cache).
- **NEVER** `image prune -a` (breaks rollback).
- **NEVER** `volume prune` (deletes persistent data).

### `tako rollback <stack> [--to <tag>]`

Redeploy of a previous tag. If `--to` is not specified, it offers a list of available tags.

## Usage model

- **Same binary** on PC and server. On PC: TUI to manage remotes. On server: local TUI + non-interactive cron.
- **Templates embedded** in the binary. Base stacks: Caddy, AdGuard, Kuma, cloudflared.
- **Homelab dir** on server: `~/.local/share/homelab/` (XDG). Never sudo.
- **Canonical templates via binary**: updating templates = updating binary.

## Deferrable (does not block MVP)

- Wizard UX of `remotes add`.
- Secure storage format for passwords (master passphrase vs OS keyring).
- Default cron frequency.
- Tag naming scheme for rollback.
