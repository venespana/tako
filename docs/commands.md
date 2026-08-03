# Spec CLI — Comandos

Tako tiene 9 comandos. El contrato público está cerrado.

## Set de comandos

```
tako                              # TUI interactivo (default)
tako doctor                       # pre-flight check
tako install                      # bootstrap host remoto
tako update [--host X]            # self-update o update de host
tako remotes <add|list|rm|use|test>
tako status [--host X]            # tabla no-interactiva
tako logs <stack> [--host X] [-f]
tako cleanup [--host X]           # prune segura
tako rollback <stack> [--to <tag>]
```

## Detalle por comando

### `tako` (default)

Lanza el TUI interactivo sobre el remote activo. Si no hay remote configurado, ofrece wizard.

### `tako doctor`

Pre-flight: revisa que el host tenga docker daemon accesible, compose v2, red `caddy`, servicios base disponibles. **Solo reporta**, no sugiere fix.

### `tako install`

Bootstrap del host remoto:
- Crea `~/.local/share/homelab/` (XDG, sin sudo).
- Escribe los `docker-compose.yml` de los stacks base desde las plantillas embebidas en el binario.
- Crea red `caddy` si no existe.
- Copia `.env.example` → `.env`.
- Instala cron del CLI (corre `tako cleanup` diariamente).
- Levanta stacks: `docker compose up -d`.

**Restricción**: no instala paquetes del SO ni escala permisos. Si docker no está disponible, aborta con mensaje claro.

### `tako update`

- **Sin `--host`**: self-update del binario. Descarga la última versión de GitHub Releases según plataforma.
- **Con `--host X`**: diff de docker-composes entre lo que corre en X vs las plantillas del binario local. Redeploy de los stacks cambiados.

### `tako remotes <subcomando>`

Gestión de conexiones:
- `add <name>`: añade un remote (wizard interactivo).
- `list`: lista remotes configurados.
- `rm <name>`: elimina un remote.
- `use <name>`: establece el remote activo.
- `test <name>`: prueba la conexión.

Tipos soportados:
- `local`: no hace conexión, opera sobre el host actual.
- `ssh user@host + password`.
- `ssh user@host + path a clave privada`.

Ambos auth al mismo nivel. Storage de credenciales con formato seguro.

### `tako status [--host X]`

Tabla no-interactiva con estado de stacks. Para scripts/cron.

### `tako logs <stack> [--host X] [-f]`

`docker compose logs` via SSH, sin abrir el TUI. `-f` para follow.

### `tako cleanup [--host X]`

Prune segura:
- `docker container prune -f` (contenedores parados).
- `docker image prune -f` (solo **dangling**).
- `docker builder prune -f` (build cache).
- **NUNCA** `image prune -a` (rompe rollback).
- **NUNCA** `volume prune` (borra datos persistentes).

### `tako rollback <stack> [--to <tag>]`

Redeploy de tag anterior. Si no se especifica `--to`, ofrece lista de tags disponibles.

## Modelo de uso

- **Mismo binario** en PC y en server. En PC: TUI para gestionar remotos. En server: TUI local + cron no-interactivo.
- **Plantillas embebidas** en el binario. Stacks base: Caddy, AdGuard, Kuma, cloudflared.
- **Dir del homelab** en server: `~/.local/share/homelab/` (XDG). Sin sudo nunca.
- **Plantillas canónicas via binario**: actualizar plantillas = actualizar binario.

## Diferible (no bloquea MVP)

- Wizard UX de `remotes add`.
- Formato de storage seguro para passwords (master passphrase vs OS keyring).
- Frecuencia default del cron.
- Naming scheme de tags para rollback.
