# Distribution

## Channels (3)

1. **GitHub Releases** → compiled binaries, direct download.
2. **install.sh** → `curl -fsSL tako.sh/install | bash` (detects OS/arch, downloads binary from GitHub Releases).
3. **npm** → `npm install -g tako` (JS compiled from TS, requires Node 20+ or Bun).

## Binary build

```bash
# Bun compile (cross-platform). Release assets: tako-linux-x64, tako-linux-arm64.
# (`-modern` on the x64 target is a compat alias for the canonical bun-linux-x64 target;
# asset names never carry a suffix.)
bun build src/index.tsx --compile --target=bun-linux-x64-modern --outfile dist/tako-linux-x64
bun build src/index.tsx --compile --target=bun-linux-arm64 --outfile dist/tako-linux-arm64
bun build src/index.tsx --compile --target=bun-darwin-x64 --outfile dist/tako-darwin-x64
bun build src/index.tsx --compile --target=bun-darwin-arm64 --outfile dist/tako-darwin-arm64
bun build src/index.tsx --compile --target=bun-windows-x64 --outfile dist/tako-windows-x64.exe
```

Supported targets (initial):

- Linux x64
- Linux arm64
- macOS x64
- macOS arm64 (Apple Silicon)
- Windows x64

## Restriction: Node 20+ compat

Since it distributes via npm, the code **MUST work on Node 20+ in addition to Bun**. See [stack.md](stack.md) for details.

## Release flow

1. Merging to `main` runs CI only (test, lint, typecheck, build) — no release.
2. Pushing a tag `vX.Y.Z` triggers the `release.yml` workflow (ADR-0017).
3. It builds `tako-linux-x64` and `tako-linux-arm64` and generates a `.sha256` sidecar per binary.
4. All binaries and sidecars are attached to the GitHub Release; `0.y.z` versions are marked prerelease.
5. npm publish and install.sh updates are follow-up steps.
