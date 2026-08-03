# ADR 0011: Canales de distribución

## Status
Accepted

## Context
Se evaluaron múltiples canales: GitHub Releases (binarios), Homebrew tap, AUR, npm, install.sh, snap, flatpak, scoop (Windows).

## Decision
**3 canales iniciales**:
1. **GitHub Releases**: binarios compilados con `bun build --compile` para Linux/macOS/Windows x64/arm64. Descarga directa.
2. **install.sh**: script `curl -fsSL tako.sh/install | bash` que detecta OS/arch y descarga binario de GitHub Releases.
3. **npm**: package `tako` con JS compilado desde TS. Requiere Node 20+ o Bun en destino.

## Consequences
- (+) Cubre ~80% de usuarios con mínimo mantenimiento.
- (+) npm channel captura JS users sin binario.
- (-) Mac power users pueden querer `brew install tako` (Homebrew tap se puede añadir después).
- (-) Arch users pueden querer AUR package (también post-MVP).
- (-) Requiere Node 20+ compat estricta en el código (prohibido APIs Bun-only).
