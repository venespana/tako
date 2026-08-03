# Plantillas de stacks base

Estas son las plantillas canónicas que el binario Tako embebe y escribe al ejecutar `tako install` en un host remoto. También sirven como referencia para montar el homelab manualmente sin Tako.

## Stacks incluidos

| Stack | Propósito |
|---|---|
| `caddy/` | Reverse proxy (caddy-docker-proxy) + fallback nginx. Único punto de entrada. |
| `adguard/` | DNS local + bloqueo de publicidad. |
| `uptime-kuma/` | Status page + alertas push. Daemon de monitoreo. |
| `cloudflared/` | Tunnel a Cloudflare (opcional). |

## Convenciones

- Todos los stacks usan la red docker externa `caddy`.
- Cada servicio declara sus labels Caddy (`caddy: <host>`, `caddy.tls: internal`, `caddy.reverse_proxy: ...`).
- Los dominios son literales (`status.homelab.internal`), no via variables `.env`.

## Uso sin Tako

Si quieres montar el homelab sin Tako:

```bash
docker network create caddy
cp -r templates/* ~/.local/share/homelab/
cd ~/.local/share/homelab/caddy && docker compose up -d
cd ~/.local/share/homelab/adguard && docker compose up -d
# etc.
```

Edita los hosts en los docker-compose.yml si quieres otro dominio base distinto de `homelab.internal`.
