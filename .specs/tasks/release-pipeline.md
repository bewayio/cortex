---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-27
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: []
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: Git-init this project into bewayio/code, a versioned release pipeline to bewayio/homebrew-bcode, and its Homebrew cask

## Status

in-progress — Phase 1 (repo hygiene, `.gitignore`) done; `.github/workflows/release.yml` written and revised to tag-based versioned releases; Phase 2 (`git init`/remote/push on `bewayio/code`) is the user's own to run; `bewayio/homebrew-bcode` cloned locally to `~/projetos/wails/bcode` (already renamed and clean, confirmed by the user), `Casks/bcode.rb` + `README.md` added and committed locally (not pushed — pending user review, and pending a real version/checksum from the first tagged release anyway); real end-to-end verification waits on both pushes happening

## Goal

This project has no git repository at all today. Turn it into one, hosted privately at `github.com/bewayio/code`, add a GitHub Actions workflow that builds native binaries for macOS, Linux and Windows on every version-tag push, publishing them as a versioned GitHub Release (with checksums) on the public `bewayio/homebrew-bcode` repo — and add a working Homebrew cask there so `brew install bewayio/bcode/bcode` actually works.

## Linked Knowledge

- Module spec: `.specs/modules/release.md` (new module — full design, revised same day for the cask)
- Architecture: `.specs/architecture/overview.md` (Modules table updated with `release`, `planned`)
- ADRs: none new

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries known (new `release` module; also touches the separate `bewayio/bcode`/`homebrew-bcode` repo's own content, which is outside this codebase)
- [x] Related ADRs reviewed (none apply)
- [x] Security implications identified: a cross-repo publish credential is required and must be user-provisioned — this assistant will not create, request, or handle that credential's value

## Decisions Already Made (2026-09-27, with the user)

1. **Two repos**: source lives in `bewayio/code` (private); release binaries + cask live in `bewayio/bcode` (public, previously unrelated content there is being repurposed).
2. **This directory has no git repo yet** — `git init`, remote, and first push are real actions on a shared GitHub repo. **The user is running Phase 2 themselves**, not delegating it to this assistant.
3. **Distribution via GitHub Releases**, not binaries committed into the releases repo's git tree.
4. **Repo rename, revised same day**: the public repo is being renamed `bewayio/bcode` → `bewayio/homebrew-bcode` — Homebrew's tap-shorthand (`brew tap bewayio/bcode`) requires the GitHub repo itself to be named `homebrew-<name>`.
5. **Trigger, revised twice, same day, final answer**: every push to `main` (back to the original design) — but with **no manual tagging by the user at all**. The workflow computes its own version (`BASE_VERSION` env var + `github.run_number`, always increasing) and creates the tag/release on `bewayio/homebrew-bcode` itself. (Intermediate revision, since abandoned: tag pushes `v*` on `bewayio/code` — rejected by the user, who wanted pushing alone to be enough.) Each push still produces one permanent, versioned release with a `checksums.txt` bundled in — the cask-checksum-pinning requirement that motivated moving off "rolling latest" in the first place is preserved.
6. **Homebrew cask is now in scope** (was previously explicitly excluded) — `bewayio/homebrew-bcode` gets a real `Casks/bcode.rb`. Other package managers (apt, snap, winget, scoop, Linux/Windows in general) remain out of scope — Homebrew Cask only installs on macOS.

## Acceptance Criteria

1. This project directory is a real git repository with `origin` pointing at `bewayio/code`, a sensible `.gitignore`, and a clean initial commit history — done interactively with the user, not unattended.
2. `.github/workflows/release.yml` triggers on every push to `main` (and via manual `workflow_dispatch`) — the user never tags anything themselves; the workflow computes its own version and tags/releases on `bewayio/homebrew-bcode`.
3. The workflow builds natively on a 3-way OS matrix (`ubuntu-latest`, `macos-latest`, `windows-latest`) via `wails build` — no cross-compilation.
4. The Wails CLI installed matches the version pinned in `go.mod`; Linux jobs install the GTK/WebKitGTK dev packages `wails build` needs there.
5. Each OS build produces a packaged artifact plus a `.sha256` checksum file for it.
6. After all three builds succeed, a publish job creates a **new, permanent, versioned** GitHub Release on `bewayio/homebrew-bcode` tagged with the pushed tag name, containing all three platform assets plus a combined `checksums.txt` — not a rolling/overwritten release.
7. `bewayio/homebrew-bcode` receives only release assets and the cask formula from this pipeline/task — no application source code.
8. A `Casks/bcode.rb` exists in `bewayio/homebrew-bcode` (local clone: `~/projetos/wails/bcode`) that installs the macOS asset as `bcode.app`, with `sha256` pinned to that release's actual checksum (not `:no_check` — the whole point of moving to versioned releases was to make a real checksum possible) and kept up to date automatically by the workflow after each release.
9. The workflow YAML and the cask Ruby file are both reviewed for correctness as thoroughly as possible by reading — this assistant cannot trigger a real GitHub Actions run or a real `brew install` to confirm either end-to-end.

## Implementation Notes

- **Repo hygiene** (done): removed `__MACOSX/`, a stray root `package-lock.json`, the committed `bcode` binary, and `build/bin/`'s contents; added `.gitignore`.
- **Wails CLI version pinning**: `go.mod` pins `github.com/wailsapp/wails/v2 v2.12.0` — the workflow installs that exact CLI version.
- **Cross-repo publish step**: `ncipollo/release-action`, `owner: bewayio`, `repo: homebrew-bcode`, authenticated with a secret `BCODE_RELEASE_TOKEN` the user creates (fine-grained PAT, `contents:write` on `bewayio/homebrew-bcode` only) and adds to `bewayio/code`'s repo secrets — **this assistant does not create tokens or touch repo secrets**.
- **Checksum mechanics**: each matrix job runs `shasum -a 256`/`Get-FileHash` on its own packaged asset, uploads the `.sha256` alongside it; the publish job concatenates all three into `checksums.txt`, bundled into the release.
- **Cask auto-update, added same day (user follow-up)**: after publishing the release, the workflow clones `bewayio/homebrew-bcode` with the same `BCODE_RELEASE_TOKEN` (it already has `contents:write` there), `sed`-replaces `Casks/bcode.rb`'s `version` and `sha256` with the computed version and the macOS asset's checksum from `checksums.txt`, and commits/pushes as `github-actions[bot]`. No manual cask edit, and no manual tag, ever needed after the initial setup.
- **Cask content** (`~/projetos/bcode/Casks/bcode.rb`, to be created): standard Homebrew cask DSL — `cask "bcode" do`, `version "X.Y.Z"`, `sha256 "..."` (from `checksums.txt`, the macOS asset's line), `url "https://github.com/bewayio/homebrew-bcode/releases/download/vX.Y.Z/bcode-macos-universal.zip"`, `name "BCode"`, a short `desc`, `homepage "https://github.com/bewayio/code"` (or wherever the project's public-facing page ends up — confirm with the user if `bewayio/code` being private makes this a bad homepage link), `app "bcode.app"`. No version exists yet at the time of writing this file (no tag has been pushed), so the initial cask file will need a placeholder version/checksum updated after the very first real release — flag this clearly rather than inventing fake values.
- **Resolved 2026-09-27**: there are two different local directories that could plausibly be "the bcode repo" — `~/projetos/bcode` (a real clone of the *old*, since-renamed `bewayio/bcode`, still holding the unrelated Python project, its own separate history — **not touched**, left as-is) and `~/projetos/wails/bcode` (previously just stray, ungit-tracked prototype files — a leftover zip and an old Wails v2.9.0 experiment, deleted). The user confirmed `~/projetos/wails/bcode` is the intended local working copy: it was wiped and freshly `git clone`d from `git@github.com:bewayio/homebrew-bcode.git`, which the user had already renamed and emptied on GitHub before this. `Casks/bcode.rb`, `README.md`, and `.gitignore` were added and committed locally there (commit `65c70df`) — not pushed yet.
- Out of scope: any Linux/Windows package manager, code signing/notarization, an in-app auto-update mechanism.

- Plan: `docs/plans/2026-09-27_release-pipeline.md`. Next command: `bsdd start` (already in progress).

## Definition Of Done

- [ ] Acceptance criteria 1–9 — criterion 1 requires the user directly present; criteria 2–8 can be written/reviewed by this assistant but not confirmed working without a real tagged push, a real GitHub Actions run, and a real `brew install` test; be explicit about what was reviewed by reading vs. actually observed.
- [ ] `release.md` and `architecture/overview.md` updated from "Planned" to shipped shape once a real tagged release has succeeded and the cask has been test-installed at least once.
- [ ] Sync Review completed if source docs changed.
