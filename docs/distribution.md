# Distribution

## Channels (3)

1. **GitHub Releases** → compiled binaries, direct download.
2. **install.sh** → `curl -fsSL tako.sh/install | bash` (detects OS/arch, downloads binary from GitHub Releases).
3. **npm** → `npm install -g tako` (JS compiled from TS, requires Node 20+ or Bun).

## Binary build

```bash
# Bun compile (cross-platform)
bun build src/cli/index.ts --compile --target=bun-linux-x64-modern --outfile dist/tako-linux-x64
bun build src/cli/index.ts --compile --target=bun-darwin-x64 --outfile dist/tako-darwin-x64
bun build src/cli/index.ts --compile --target=bun-darwin-arm64 --outfile dist/tako-darwin-arm64
bun build src/cli/index.ts --compile --target=bun-windows-x64 --outfile dist/tako-windows-x64.exe
```

Supported targets (initial):
- Linux x64
- macOS x64
- macOS arm64 (Apple Silicon)
- Windows x64

## Restriction: Node 20+ compat

Since it distributes via npm, the code **MUST work on Node 20+ in addition to Bun**. See [stack.md](stack.md) for details.

## Release flow

1. Tag `vX.Y.Z` on main.
2. GitHub Actions workflow `release.yml` triggers.
3. Build binaries for all targets.
4. Publishes GitHub Release with binaries attached.
5. Publishes on npm.
6. Updates install.sh if needed.
