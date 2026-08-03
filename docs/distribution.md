# Distribución

## Canales (3)

1. **GitHub Releases** → binarios compilados, descarga directa.
2. **install.sh** → `curl -fsSL tako.sh/install | bash` (detecta OS/arch, baja binario de GitHub Releases).
3. **npm** → `npm install -g tako` (JS compilado desde TS, requiere Node 20+ o Bun).

## Build binario

```bash
# Bun compile (cross-platform)
bun build src/cli/index.ts --compile --target=bun-linux-x64-modern --outfile dist/tako-linux-x64
bun build src/cli/index.ts --compile --target=bun-darwin-x64 --outfile dist/tako-darwin-x64
bun build src/cli/index.ts --compile --target=bun-darwin-arm64 --outfile dist/tako-darwin-arm64
bun build src/cli/index.ts --compile --target=bun-windows-x64 --outfile dist/tako-windows-x64.exe
```

Targets soportados (inicial):
- Linux x64
- macOS x64
- macOS arm64 (Apple Silicon)
- Windows x64

## Restricción: Node 20+ compat

Como distribuye via npm, el código **DEBE funcionar en Node 20+ además de Bun**. Ver [stack.md](stack.md) para detalles.

## Release flow

1. Tag `vX.Y.Z` en main.
2. GitHub Actions workflow `release.yml` se dispara.
3. Build binarios para todos los targets.
4. Publica GitHub Release con binarios adjuntos.
5. Publica en npm.
6. Actualiza install.sh si hace falta.
