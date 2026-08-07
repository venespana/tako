# Base stack templates

These are the canonical templates that the Tako binary embeds and writes when running `tako install` on a remote host. They also serve as a reference for setting up the homelab manually without Tako.

## Included stacks

| Stack          | Purpose                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `caddy/`       | Reverse proxy (caddy-docker-proxy) + nginx fallback. Single entry point. |
| `adguard/`     | Local DNS + ad blocking.                                                 |
| `uptime-kuma/` | Status page + push alerts. Monitoring daemon.                            |
| `cloudflared/` | Tunnel to Cloudflare (optional).                                         |

## Conventions

- All stacks use the external docker network `caddy`.
- Each service declares its Caddy labels (`caddy: <host>`, `caddy.tls: internal`, `caddy.reverse_proxy: ...`).
- Domains are literals (`status.homelab.internal`), not via `.env` variables.

## Usage without Tako

If you want to set up the homelab without Tako:

```bash
docker network create caddy
cp -r templates/* ~/.local/share/homelab/
cd ~/.local/share/homelab/caddy && docker compose up -d
cd ~/.local/share/homelab/adguard && docker compose up -d
# etc.
```

Edit the hosts in the docker-compose.yml if you want a base domain other than `homelab.internal`.
