# ADR 0017: Release trigger resolution (ADR 0006 vs AGENTS.md) + per-arch assets

## Status

Accepted (resolves the ADR 0006 / AGENTS.md contradiction; supersedes the AGENTS.md auto-release wording)

## Context

Two repository documents contradicted each other:

- ADR 0006 (GitOps via tags): release/deploy on tag push `v*`.
- AGENTS.md §5 (Versioning): merging to `main` automatically tags `v<version>` and publishes a GitHub Release.

In practice `release.yml` implemented the merge-to-main auto-release, leaving ADR 0006 inert. The agent's install flow additionally downloads per-arch binary assets from GitHub Releases when the client's architecture does not match the server's, which requires trustworthy per-arch asset URLs (`tako-linux-x64`, `tako-linux-arm64`) and checksum sidecars on every release.

## Decision

1. **Releases trigger only on tag push `v*`.** Merging to `main` runs CI (test + lint + typecheck + build) only. Tagging `v<version>` is the deliberate act that publishes a release (ADR 0006 wins).
2. **Per-arch assets on every release**: `release.yml` builds a matrix of `bun-linux-x64-modern → tako-linux-x64` and `bun-linux-arm64 → tako-linux-arm64`, generates a `<asset>.sha256` sidecar per binary, and attaches all binaries and sidecars to the GitHub Release.
3. **0.x prerelease semantics are kept**: releases for `0.y.z` versions are marked prerelease.
4. The version-bump-per-PR rule is unchanged. AGENTS.md §5 and `docs/distribution.md` are updated to match.

## Consequences

- (+) Deliberate releases; trivial rollback (retag or delete the tag).
- (+) The arm64 Releases fallback for agent install becomes functional.
- (+) Checksum sidecars let installers verify downloaded binaries.
- (-) Requires tagging discipline: a merge without a tag simply does not release.
- (-) Release contents are whatever the tag points at; cutting from `main` assumes CI green on main.

## References

- ADR 0006: GitOps via tags
- Design: `openspec/changes/remote-agent/design.md` (D7, §Release Workflow)
- `.github/workflows/release.yml`
