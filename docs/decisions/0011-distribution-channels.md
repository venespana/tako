# ADR 0011: Distribution channels

## Status
Accepted

## Context
Multiple channels were evaluated: GitHub Releases (binaries), Homebrew tap, AUR, npm, install.sh, snap, flatpak, scoop (Windows).

## Decision
**3 initial channels**:
1. **GitHub Releases**: binaries compiled with `bun build --compile` for Linux/macOS/Windows x64/arm64. Direct download.
2. **install.sh**: `curl -fsSL tako.sh/install | bash` script that detects OS/arch and downloads the binary from GitHub Releases.
3. **npm**: `tako` package with JS compiled from TS. Requires Node 20+ or Bun on the target.

## Consequences
- (+) Covers ~80% of users with minimal maintenance.
- (+) npm channel captures JS users without a binary.
- (-) Mac power users may want `brew install tako` (Homebrew tap can be added later).
- (-) Arch users may want an AUR package (also post-MVP).
- (-) Requires strict Node 20+ compat in the code (Bun-only APIs forbidden).
