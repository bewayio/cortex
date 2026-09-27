---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-09-27
version: 1
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: []
  sync_triggers:
    - Changes to public interface
    - New or removed events
    - Changes to dependencies
---

# Module: release

## Purpose

Build BCode's desktop binaries for macOS, Linux and Windows via GitHub Actions, and publish them to a public release repository so they're ready for distribution (starting with a future Homebrew cask, later other package managers).

## Boundaries

- Owns: `.github/workflows/release.yml` (and any small helper scripts it needs), the versioned GitHub Releases on the public `bewayio/homebrew-bcode` repo, and (once set up) that repo's `Casks/bcode.rb` Homebrew cask formula.
- Does NOT own: application runtime behavior (every other module above), the actual Homebrew cask formula or any other package-manager packaging (future work, not part of this module yet), code signing/notarization (not attempted — binaries ship unsigned for now).

## Public Interface

None — this is a CI/CD pipeline (GitHub Actions), not a runtime API. It has no Wails-bound Go methods and no frontend components.

## Events Published

None (in the Wails-event sense). Externally, a successful run updates the `bewayio/bcode` GitHub Release — not something the running app itself observes or reacts to.

## Events Consumed

None.

## Dependencies

| Dependency | Type | Interface |
|-----------|------|-----------|
| GitHub Actions | external service | workflow YAML in `.github/workflows/` |
| Wails CLI | build tool | `wails build`, version pinned to match `go.mod`'s `github.com/wailsapp/wails/v2` |
| Cross-repo publish credential | external, user-provisioned secret | a fine-grained PAT (or equivalent) with write access to `bewayio/bcode` only, stored as a GitHub Actions secret in `bewayio/code` |

## Areas

| Area | Permission Level |
|------|-----------------|
| CI/CD (GitHub Actions) | maintainer-only — triggered by pushes to the private `bewayio/code` repo, publishes to the public `bewayio/bcode` repo |

## Security

- The cross-repo publish credential must be scoped as narrowly as possible (write access to `bewayio/homebrew-bcode` only, not org-wide) and stored only as a GitHub Actions secret — never committed, never handled by an assistant on the user's behalf.
- No application secrets (DB passwords, the local encryption key from ADR-0009, chat history, etc.) are involved in or exposed by this pipeline — it only ever touches build inputs (source code) and build outputs (binaries).
- `bewayio/code` (source) stays private; `bewayio/homebrew-bcode` (binaries + cask) stays public and should never receive source code, only release assets and the cask formula itself.

## Notes

- **Planned 2026-09-27, user request.** Two-repo split, both already existing as empty/unrelated-content GitHub repos at the time of this spec: `bewayio/code` (private) becomes this project's actual source repo — **this working directory has no `.git` at all yet**; the public releases repo was described as intentionally "clean," ready for a Homebrew cask and, later, other Linux/Windows package managers (the latter still future work; the cask itself is now in scope, see below).
- **Repo renamed to `homebrew-bcode`, same day, user follow-up.** Homebrew's tap-shorthand convention (`brew tap bewayio/bcode`) requires the underlying GitHub repo to be named `homebrew-<tap-name>` — a plain `bcode` repo would only work via the full-URL tap syntax. The user is renaming `bewayio/bcode` → `bewayio/homebrew-bcode` on GitHub; every reference in this module and its task/workflow uses the new name.
- **Distribution mechanism**: GitHub Releases, not binaries committed into the repo's git tree — chosen on the user's confirmation, since committed binaries would make that repo's `.git` grow forever even as old versions are removed from view, and Releases is what a Homebrew cask (and most other package managers) expect anyway.
- **Trigger revised twice, same day, user follow-ups.** First revision: tag pushes (`v*`) instead of every push to `main` — the original rolling-"latest" design was incompatible with a cask's `sha256` pinning one exact checksum per version. Second revision (final): **back to every push to `main`**, but without any manual tagging — the user wanted pushing `bewayio/code` alone to be enough, with GitHub Actions inventing the version and creating the tag/release on `bewayio/homebrew-bcode` itself, not requiring the user to tag anything. The workflow computes `v${BASE_VERSION}.${{ github.run_number }}` (a workflow-level `BASE_VERSION` env var for manual major/minor bumps, `github.run_number` as an always-increasing patch number — unique per run, never reused), creates one real, permanent, versioned GitHub Release under that computed tag, and bundles a `checksums.txt` (sha256 per platform asset) into it — the cask pins these exact values per version, satisfying the same correctness requirement the first revision was for, without the manual tagging step.
- **Build strategy**: a 3-way OS matrix (`ubuntu-latest`, `macos-latest`, `windows-latest`), each building natively via `wails build` for its own platform — Wails apps are not cross-compiled (cgo + native webview bindings per OS), so there is no way to build all three from a single runner.
- **Known limitation, accepted for now**: binaries are unsigned/unnotarized. macOS will show a Gatekeeper warning on first launch; Windows SmartScreen may warn too. Code signing needs paid developer accounts/certificates on both platforms and is out of scope unless requested separately.
- **Homebrew cask, same day, user follow-up — now in scope**: `bewayio/homebrew-bcode` gets a `Casks/bcode.rb` file following Homebrew's cask DSL (`cask "bcode" do ... end`, `app "bcode.app"` for the macOS `.app` bundle from the release asset). Only the macOS asset is installable via a cask (Homebrew Cask is macOS-only by design) — Linux/Windows package managers remain future work, unaffected by this. Local working copy: `~/projetos/wails/bcode` (freshly cloned from the renamed, emptied repo — distinct from `~/projetos/bcode`, an older clone of the same repo under its *old* name/content, left untouched). `homepage` in the cask points at `bewayio/homebrew-bcode` itself, not `bewayio/code`, since the source repo is private and would 404 for `brew home`. The macOS bundle identifier is `com.wails.bcode` (Wails' default `com.wails.{{.Name}}` template, never customized in `build/darwin/Info.dev.plist`) — used for the cask's `zap` stanza. `version`/`sha256` in the cask are placeholders until the first real tagged release exists; committed locally, not pushed.
- **Bug found from a real CI run, 2026-09-29 (Linux)**: the Linux job failed compiling with `Package webkit2gtk-4.0 was not found` — exactly the risk flagged in the original workflow comment. Root cause confirmed: it's not just an apt package rename, Wails v2.12.0's own webview bindings look up `webkit2gtk-4.0` via pkg-config specifically (hardcoded), and `ubuntu-latest` had moved to Ubuntu 24.04, which dropped that package in favor of `webkit2gtk-4.1` — installing `libwebkit2gtk-4.1-dev` (the original guess) doesn't satisfy a pkg-config lookup for the `-4.0` name. Fixed by pinning the Linux matrix entry to `ubuntu-22.04` (still ships `libwebkit2gtk-4.0-dev`) instead of `ubuntu-latest`, reverting the apt package back to `-4.0-dev`. The `publish` job still uses `ubuntu-latest` — it never compiles anything webview-related, so it's unaffected.
- **Bug found from a real CI run, 2026-09-29 (macOS)**: the macOS build failed on `npm install` with a `403` fetching `zustand` from `npm.artifacts.furycloud.io`. Root cause found on user follow-up: `frontend/package-lock.json` had 254 `resolved` URLs hardcoded to that private registry — it must have been generated on a machine configured to use it, and `npm ci`/`npm install` use a lockfile's literal `resolved` URL per package regardless of the configured registry. Fixed by regenerating the lockfile from scratch on this machine (confirmed to use the real `registry.npmjs.org`, no `.npmrc` anywhere pointing elsewhere) — `npm run build` and `go build ./...` both verified clean against the new lockfile. Also added, as a defensive belt-and-suspenders measure (not the actual fix, but cheap insurance against the same class of problem recurring if the lockfile is ever regenerated on a differently-configured machine): `NPM_CONFIG_REGISTRY: https://registry.npmjs.org/` in the workflow's top-level `env:`. Also bumped `setup-node`'s `node-version` from `20` to `22` while investigating, since the same log showed an `EBADENGINE` warning for `chevrotain` (a transitive dependency) wanting Node ≥22. **Not yet re-verified with a real CI run** — the local build passes, but this hasn't been pushed and run on GitHub Actions yet.
- Task: `.specs/tasks/release-pipeline.md`.
