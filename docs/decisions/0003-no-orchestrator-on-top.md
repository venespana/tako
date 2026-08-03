# ADR 0003: Sin orquestador encima

## Status
Accepted

## Context
El maintainer probó Coolify y le resultó incómodo por la abstracción. Komodo se evaluó pero comparte el mismo problema: añade otra capa con su propio modelo mental (Resources, Stacks, Build, Procedures, Deployments). Portainer hace lo mismo con overhead similar.

## Decision
**No usar orquestador encima de docker-compose**. Cada servicio es un stack `docker-compose.yml` autónomo, gestionado por:
- GitOps via GitHub Actions (deploy on tag).
- Cron para cleanup.
- TUI custom (Tako) para gestión interactiva local via SSH.

## Consequences
- (+) Máximo control: lo que ves en el repo es lo que corre.
- (+) Cada pieza es reemplazable (lazydocker, Kuma, Dozzle equivalentes se pueden cambiar sin tocar las demás).
- (+) Cero dependencia de una herramienta con modelo propio que mantener.
- (-) Necesitas combinar varias piezas pequeñas en vez de una grande.
- (-) Build de imágenes desde Dockerfile en UI no está cubierto por defecto (se hace en CI).
