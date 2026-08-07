# ADR 0001: Project name — Tako

## Status

Accepted

## Context

We needed a project name that met: short (1-2 syllables), pronounceable in ES/EN, unique in brew/AUR/npm, available as a thematic domain, evocative without being literal, logo-friendly.

Options were evaluated in three categories: animals (Gecko, Tako), household objects (Hearth, Loom), abstract (Otis, Milo).

## Decision

**Tako**. Octopus in Japanese. Multi-tentacle metaphor = natural multi-host. 4 letters, 2 syllables, pronounceable in both languages.

## Consequences

- (+) `brew install tako` available (formula free).
- (+) AUR free.
- (+) `tako.sh` and `tako.io` free as domains.
- (+) Zero collisions in GitHub devops/docker/homelab space.
- (~) "Taco" in Spanish is an easy pun, not problematic.
- (-) Gecko discarded: Mozilla essentially owns the brand.
- (-) Mako discarded: conflicts with `emersion/mako` (Wayland), `sqlalchemy/mako` (Python), `chjj/mako` (Bitcoin), and brew formula taken.
