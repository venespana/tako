# Research: Remote-agent binary distribution (change `remote-agent`)

- **Artifact**: `gentle-ai.sdd-research/v1`
- **Revision**: 2 (corrective retry #1 — replaces blocked revision 1)
- **Outcome**: `partial`
- **Accessed at**: 2026-09-17

## Admission & evidence mechanism

The runtime grant ledger reports `documentation=[]` and `open-web=[]` and exposes no grant
surface to admit evidence classes. Evidence was therefore gathered with the **`webfetch-direct`
mechanism** available in this runtime: the Context7 documentation API (which proxies upstream
publisher docs, e.g. `oven-sh/bun`, `actions/runner`, GitLab docs). The in-app browser
(OpenChamber) was attempted as a second webfetch surface and is not drivable in this runtime
("no OpenChamber client connected"). Per the corrective instruction, retrieval success via this
mechanism is treated as admissible; claims carry source URL + doc section. No claim is made
without a retrievable source.

## Questions

1. How does VS Code Remote SSH provision its server binary (arch detection, commit pinning,
   checksums, offline path)?
2. What are Bun `build --compile` targets and glibc/static-linking constraints for target machines?
3. `uname -m` → asset mapping conventions over SSH; behavior when no asset matches?
4. Checksum/integrity practice in GitHub Actions Runner / GitLab Runner; what is sensible over
   authenticated SSH?

## Sources

| ID | Class | Title / Section | Publisher | URL |
|----|-------|-----------------|-----------|-----|
| S1 | documentation | Bun docs — "Cross-compile to other platforms > Supported targets" / executables.mdx | Bun (oven-sh) | https://github.com/oven-sh/bun/blob/main/docs/bundler/executables.mdx |
| S2 | documentation | Bun docs — "Cross-compile for Linux ARM64" | Bun (oven-sh) | https://github.com/oven-sh/bun/blob/main/docs/bundler/executables.mdx |
| S3 | documentation | Bun docs — Troubleshooting: cannot find `libatomic.a` | Bun (oven-sh) | https://github.com/oven-sh/bun/blob/main/docs/project/contributing.mdx |
| S4 | documentation | actions/runner — releaseNote.md (download + SHA-256 checksums) | GitHub (actions) | https://github.com/actions/runner/blob/main/releaseNote.md |
| S5 | documentation | GitLab Runner docs — Install step runner manually: verify authenticity | GitLab | https://docs.gitlab.com/runner/install/step-runner/ |
| S6 | repository | docs/distribution.md | tako (repo) | file:docs/distribution.md |
| S7 | repository | docs/decisions/0006-gitops-via-tags.md | tako (repo) | file:docs/decisions/0006-gitops-via-tags.md |
| S8 | repository | AGENTS.md (pre-commit/release workflow section) vs ADR-0006 | tako (repo) | file:AGENTS.md |
| S9 | repository | `.github/` directory listing | tako (repo) | file:.github/ (absent) |

## Validated claims

### Bun compile targets & libc constraints
- C1 (S1): Bun supports `bun-linux-x64` and `bun-linux-arm64` (glibc) plus musl variants for
  both; on x64 the `-baseline` and `-modern` suffixes are accepted for backward compatibility
  and **resolve to the same binary** — you do not need to pick one based on the destination CPU.
  → The repo's `bun-linux-x64-modern` output is byte-equivalent in CPU coverage to
  `bun-linux-x64`; targeting it does not restrict server compatibility.
- C2 (S2): Default architecture is x64 when none is specified; Linux ARM64 cross-compilation is
  documented and requires no special tooling (e.g. AWS Graviton / Raspberry Pi).
- C3 (S3): Bun statically links `libatomic` by default; dynamic linking is only a
  build-environment fallback and "may not work on other systems" — i.e. cross-compiled Bun
  binaries are self-contained relative to the target's libatomic, though glibc vs musl target
  selection still matters (C1).

### Arch detection → asset mapping conventions
- C4 (S4): GitHub Actions Runner publishes per-arch assets named
  `actions-runner-linux-{x64,arm64,arm}-<version>.tar.gz`; the setup instructions pick the asset
  by architecture, and a wrong/unmatched arch simply has no download command — the convention is
  a deterministic `os-arch` asset name with no arch fallback.
- C5 (S5): GitLab Runner uses the same pattern (`gitlab-runner-freebsd-amd64`,
  `-linux-arm64`-style suffixes across amd64/arm64/386/arm/s390x/ppc64le). Combined with C4:
  the industry convention is `uname -m` → normalized arch token (`x86_64`→`x64`/`amd64`,
  `aarch64`→`arm64`) → exact asset name; on no match, fail the provisioning step explicitly.

### Checksum / integrity practice
- C6 (S4): GitHub Actions Runner publishes SHA-256 checksums for every package; the documented
  flow downloads the tarball and verifies before use.
- C7 (S5): GitLab ships SHA256 sidecar checksums plus GPG signatures (`.asc`) for stronger
  authenticity. Both tools verify because the download happens over an unauthenticated channel
  (HTTPS/CDN). For Tako, the copy-over-SSH path already runs through an authenticated,
  integrity-checked channel (SSH MAC/cipher), so a checksum comparison adds protection mainly
  against local truncation/corruption (a cheap post-copy `sha256sum` of client vs remote is a
  sensible guard), while a GPG-style chain is only needed for the download path.

### VS Code Remote SSH provisioning
- **unverified** — attempted URL `https://code.visualstudio.com/docs/remote/faq` (and related
  `/docs/remote/ssh` pages) is not retrievable in this runtime: Context7 has no matching VS Code
  Remote library, and the OpenChamber browser is not drivable. The well-known pattern (arch
  detection, commit-pinned download from `update.code.visualstudio.com`, checksum, offline
  install by copying a locally downloaded server tarball) is cited here only as **directional,
  unverified context** and MUST NOT be relied on as evidence until re-fetched.

### In-repo facts (carried forward from blocked run, re-verified)
- C8 (S6): Documented release targets are Linux x64, macOS x64/arm64, Windows x64 — **no Linux
  arm64** release asset exists today.
- C9 (S9): `.github/workflows/` does not exist yet; `release.yml` is aspirational (S6 §Release flow).
- C10 (S7 vs S8): ADR-0006 (Accepted) says release/deploy triggers on tag push (`v*`);
  AGENTS.md describes automatic release+tag on merge to main. Contradiction to resolve before
  the release pipeline (and hence strategy (b)'s download URL) can be trusted.

## Verdicts (product-choice reasoning; non-authoritative)

**(a) Copy client's own binary over SFTP/exec stdin — RECOMMENDED for v0.**
Supported by C1 (the x64-modern client binary covers any x64 glibc Linux server), C8 (no
arm64 asset exists, so a download fallback has nothing to fall back *to*), C6/C7 (SSH channel
integrity is intrinsic; add a post-copy sha256 comparison against the local file, not a
published sidecar). Pros: works on servers without outbound internet, no release-pipeline
dependency (C9 — no workflows exist yet), version match between client and agent is free.
Cons: ties agent version to client version (acceptable for a tightly-coupled agent); large
binary transfer (~90–100 MB Bun binaries) over SSH, mitigable with compression.

**(b) Server downloads from GitHub Releases — NOT viable for v0.**
Blocked by C8 (no Linux arm64 asset; fine for x64) and C9 (no release workflow → nothing to
download yet), plus C10 (release-trigger contradiction must be resolved first). It also
requires outbound HTTPS from the homelab server and adds pinning/verification work. It becomes
relevant only when a Linux arm64 target ships.

**(c) Hybrid (copy first, download fallback on arch mismatch) — DEFER.**
The only mismatch case today (arm64 server) has no asset to download (C8), so the fallback is
dead code in v0. Re-introduce when Linux arm64 is added to the release matrix; the asset-name
convention is already standardized by C4/C5.

**Recommendation for v0 (x64-only servers)**: strategy (a) — copy the client's
`dist/tako-linux-x64` binary to `~/.tako/tako` over the existing SSH channel, `chmod +x`,
verify with a client-side vs remote `sha256sum` comparison, and fail explicitly with a clear
message when `uname -m` is not `x86_64`. Design the asset-resolution function
(`uname -m` → asset name) now so strategy (c) slots in later without rework.

## Contradictions, uncertainty, freshness

- Contradiction: AGENTS.md (merge-to-main auto-release) vs ADR-0006 (tag-push release) — S8/S10.
- Uncertainty: exact VS Code Remote provisioning behavior — `unverified` (attempted URLs above).
- Freshness: Bun target table reflects current bun docs (C1 note confirms `-modern` is now a
  compat alias — repo docs/distribution.md should eventually drop the suffix).
- Evidence gap: Bun standalone-binary glibc minimum version on target machines not confirmed in
  retrieved excerpts — `unverified` (attempted S1 full text).

## Product decisions

- `pending`: adopt strategy (a) for v0 — confirmed by research recommendation but owned by
  orchestrator.
