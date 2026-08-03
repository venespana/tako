# ADR 0001: Nombre del proyecto — Tako

## Status
Accepted

## Context
Necesitábamos un nombre para el proyecto que cumpliera: corto (1-2 sílabas), pronunciable en ES/EN, único en brew/AUR/npm, disponible como dominio temático, evocador sin ser literal, logo-friendly.

Se evaluaron opciones en tres categorías: animales (Gecko, Tako), objetos del hogar (Hearth, Loom), abstractos (Otis, Milo).

## Decision
**Tako**. Pulpo en japonés. Metáfora multi-tentáculo = multi-host natural. 4 letras, 2 sílabas, pronunciable en ambos idiomas.

## Consequences
- (+) `brew install tako` disponible (formula libre).
- (+) AUR libre.
- (+) `tako.sh` y `tako.io` libres como dominios.
- (+) Cero colisiones en GitHub espacio devops/docker/homelab.
- (~) "Taco" en español es juego de palabras facilón, no problemático.
- (-) Gecko descartado: Mozilla esencialmente owns la marca.
- (-) Mako descartado: conflictos con `emersion/mako` (Wayland), `sqlalchemy/mako` (Python), `chjj/mako` (Bitcoin), y brew formula tomada.
