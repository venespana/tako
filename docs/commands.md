# CLI Spec — Commands

Tako has 10 commands. The public contract is closed. (`agent` added per ADR-0015.)

## Command set

```
tako                              # interactive TUI (default)
tako doctor                       # pre-flight check
tako install                      # bootstrap remote host
tako update [--host X]            # self-update or host update
tako remote add                   # add remote (interactive wizard)
tako remotes <list|rm|use|test>
tako status [--containers] --host <remote>  # non-interactive table (REQUIRED --host for now)
tako logs <stack> [--host X] [-f]
tako cleanup [--host X]           # safe prune
tako rollback <stack> [--to <tag>]
tako agent <run|install|uninstall|status>
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

### `tako remote add`

Interactive wizard to add a new remote connection. Collects name, SSH user, host, port, and credentials via `@inkjs/ui` TUI.

- Name is collected in-form (not as positional argument).
- SSH validation is performed before saving.
- Unknown hostkeys are shown; user must explicitly accept.
- Passwords are stored obfuscated (NOT encrypted — see ADR 0014).

Supported types:

- `ssh user@host + password` (store or transient).
- `ssh user@host + path to private key`.

### `tako remotes <subcommand>`

Connection management (remaining subcommands):

- `list`: lists configured remotes.
- `rm <name>`: removes a remote.
- `use <name>`: sets the active remote.
- `test <name>`: tests the connection.

### `tako status [--containers] --host <remote>`

Non-interactive table with stack status. For scripts/cron. `--host` is REQUIRED
for now — it names a configured remote (`tako remote add`); it becomes optional
once a default remote (`remotes use`) exists.

By default it runs `docker compose ls --format json` on the remote over SSH
(read-only). With `--containers` (ADR 0021) it runs `docker ps -a --format
'{{json .}}'` instead and prints one line per container — name, state, and
health (`-` when the container defines no healthcheck) — plus a count line.
Health is auxiliary metadata: docker versions or containers without a usable
health field simply show `-`; the strict refusal discipline covers the core
fields only.

Exit codes (both modes): `0` ok (an empty listing prints `no compose stacks
found`, or `no containers found` with `--containers`); `1` refused or invalid
usage — unknown remote, refused connection, missing docker/compose on the
host, absent `--host` — with the reason on stderr; `2` unexpected failure.

```console
$ tako status --host nas
NAME   STATUS  CONFIG FILES
media  up      /srv/media/compose.yml

$ tako status --containers --host nas
NAME           STATE    HEALTH
media-web-1    running  healthy
media-db-1     exited   -
2 containers
```

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

### `tako agent <subcommand>`

Persistent agent family on managed servers (ADR-0015). One subcommand runs on the server; three manage it from the client over SSH.

- `run`: agent-mode daemon (server). Started by the `systemd --user` unit (`tako-agent.service`): binds `~/.tako/agent.sock`, opens the job database, and serves the protocol the client uses. Never imports the TUI.
- `install <remote>` (client): pre-flight checks → distributes the binary (SFTP copy on arch match, GitHub Releases download with sha256 verification otherwise) → installs the unit and enables linger → starts the agent → verifies it on a **second** SSH connection. Idempotent: re-running on an existing install performs the upgrade.
- `uninstall <remote>` (client): stops and removes the unit, disables linger only if it was enabled by Tako, removes `~/.tako/`, and verifies residue on a second connection.
- `status <remote>` (client): text table with unit state, linger (+ whether Tako enabled it), agent/client versions and protocol, job count, and socket handshake result.

Plain console output — no TUI.

## Usage model

- **Same binary** on PC and server. On PC: TUI to manage remotes. On server: local TUI + non-interactive cron.
- **Templates embedded** in the binary. Base stacks: Caddy, AdGuard, Kuma, cloudflared.
- **Homelab dir** on server: `~/.local/share/homelab/` (XDG). Never sudo.
- **Canonical templates via binary**: updating templates = updating binary.

## Deferrable (does not block MVP)

- Secure storage format for passwords (master passphrase vs OS keyring). Currently uses reversible obfuscation (v0 debt).
- Default cron frequency.
- Tag naming scheme for rollback.
