# Plan: Git-init into bewayio/code + GitHub Actions release pipeline to bewayio/bcode

- Task: `.specs/tasks/release-pipeline.md`
- Modules: `release.md` (new), `architecture/overview.md`
- ADR: none
- Execution model: **single agent**, phases in sequence
- Status: in-progress

## Goal

Turn this directory into a real git repo hosted privately at `bewayio/code`, then add a GitHub Actions workflow that builds native macOS/Linux/Windows binaries on every push to `main` and publishes them as a rolling `latest` GitHub Release on the public `bewayio/bcode`.

## Definition of Ready

- [x] Spec, criteria and decisions are current (task's "Decisions Already Made")
- [x] Touches: new `release` module only (no application code changes)
- [x] No ADR needed
- [x] Confirmed pinned Wails version: `go.mod` → `github.com/wailsapp/wails/v2 v2.12.0`

## Repo audit findings (read before Phase 1)

This directory has real hygiene problems that must be dealt with **before** the first commit, since there's no git history yet to clean up after the fact:

- `bcode` at the repo root — a 6MB compiled binary, must never be committed.
- `build/bin/` — contains `bcode` and `bcode.app`, Wails' own build output; must be gitignored. `build/appicon.png` and `build/darwin/Info.dev.plist` are config, not output — keep those.
- `__MACOSX/` — leftover macOS zip-extraction metadata junk (`._*` files), should be deleted outright, not gitignored.
- `package-lock.json` at the repo root — a stray, essentially empty file (`"packages": {}`, `"name": "code"`) that doesn't match this project (the real one is `frontend/package-lock.json`); looks like leftover cruft, not something to commit as-is.
- `frontend/node_modules/`, `frontend/dist/`, `frontend/wailsjs/` — standard Wails project story: gitignore all three. `wails build` regenerates `wailsjs` (via `wails generate module`) and `dist` (via the frontend build) as part of its own pipeline, so nothing is lost by not committing them.

## Phases

| # | Phase | Size | Depends on |
|---|-------|------|------------|
| 1 | Repo hygiene + `.gitignore` (no git yet) | S | none |
| 2 | `git init`, first commit, remote, push — **user present for every step** | M | 1 |
| 3 | GitHub Actions: 3-OS build matrix | M | none |
| 4 | GitHub Actions: publish job to `bewayio/bcode` | M | 3 |
| 5 | Verify | M | 2, 4 |
| 6 | Docs and finish | S | 5 |

### Phase 1: repo hygiene

- [x] Confirm with the user, then delete `__MACOSX/` and the stray root `package-lock.json` (both look like pure junk, not something to preserve or commit).
- [x] Confirm with the user, then delete the root `bcode` binary and `build/bin/`'s contents (regenerable by `wails build`/`wails dev` any time).
- [x] Write `.gitignore` at the repo root: `frontend/node_modules/`, `frontend/dist/`, `frontend/wailsjs/`, `build/bin/`, the root `bcode` binary path, plus standard OS/editor cruft (`.DS_Store`, etc.).
- [x] Double-check nothing under `~/.bcode` (the app's own local data dir) or any test artifacts from this session ever ended up inside the repo directory itself — confirm with `find . -maxdepth 2` after the above cleanup, before moving to Phase 2.

### Phase 2: git init, first commit, remote, push

**This entire phase requires the user directly present, confirming each command before it runs — `git init`, adding the remote, and the first push to a real GitHub repo are not run unattended.** User's explicit call (2026-09-27): they're doing this phase themselves ("configuro o repo aqui e faço o commit") — not delegated to this assistant.

- [ ] `git init`, `git branch -M main` (explicit, don't rely on the local default branch name).
- [ ] `git add -A` (safe here since Phase 1's `.gitignore` is already in place), `git status` reviewed by the user before committing — confirm no `node_modules`, `dist`, `wailsjs`, or binaries slipped through.
- [ ] First commit — a plain, honest message (e.g. "Initial commit"), not amended/rewritten later.
- [ ] `git remote add origin git@github.com:bewayio/code.git` — confirm SSH vs HTTPS with the user first (their other local `bcode` clone uses SSH; likely the same preference here, but ask rather than assume).
- [ ] `git push -u origin main` — only after the user has visually reviewed `git log`/`git status` and explicitly says to push.

### Phase 3: build matrix

- [x] `.github/workflows/release.yml`, triggered `on: push: branches: [main]`.
- [x] Matrix: `ubuntu-latest`, `macos-latest`, `windows-latest`. Each job: checkout, setup-go, setup-node, install Wails CLI pinned to `v2.12.0` (`go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0`), Linux-only step installing `libgtk-3-dev`, `pkg-config`, and the WebKitGTK dev package — **flag as a real risk**: the exact package name (`libwebkit2gtk-4.0-dev` vs `libwebkit2gtk-4.1-dev`) depends on the Ubuntu version `ubuntu-latest` resolves to at run time, which this assistant cannot verify without an actual run; write the step to try the modern name first and note in a comment how to adjust if the job fails on this step.
- [x] Run `wails build` (add `-clean` if useful, consider `-trimpath`); package the output per OS (implementer's call, keep it simple for v1 — e.g. zip the produced binary/bundle with `actions/upload-artifact`); upload as a build artifact per OS.

### Phase 4: publish job

- [x] A `publish` job with `needs: [build]` (or the matrix job's name) that downloads all three artifacts.
- [x] Cross-repo release step (e.g. `ncipollo/release-action`, which supports an explicit `owner`/`repo` pair for publishing to a *different* repository than the one the workflow runs in) targeting `owner: bewayio`, `repo: bcode`, `token: ${{ secrets.BCODE_RELEASE_TOKEN }}`, `tag: latest`, `prerelease: true`, `allowUpdates: true`, `replacesArtifacts: true` (or the equivalent options for whichever action is used) — the point is a single release that gets its assets replaced every run, not a new release per push.
- [x] Add a short `README`-level comment or note (in the workflow file itself, as a YAML comment) explaining that `BCODE_RELEASE_TOKEN` must be added as a repo secret by the user, scoped to `contents:write` on `bewayio/bcode` only — this assistant does not create it.

### Phase 5: verify

- [x] Read the full workflow YAML end-to-end for syntax correctness and logical soundness (matrix expansion, `needs` ordering, secret references, artifact names matching between upload/download steps) — as thorough as review-without-execution can be. Also parsed with `python3 -c "import yaml; yaml.safe_load(...)"` to confirm it's at least valid YAML.
- [ ] Once Phase 2's push has happened, use `gh run list` / `gh run view` (read-only, non-destructive) if the user has `gh auth` set up and is comfortable with this assistant checking run status, to see whether the actual GitHub Actions run succeeded — this is the one piece of real verification this assistant *can* do post-push, unlike everything else in this task. **Not currently possible**: `gh` CLI isn't installed in this environment — the user would need to install it (or just check the Actions tab themselves and report back) for this step to happen.
- [ ] Record explicitly what was verified by reading vs. by an actual observed run.

### Phase 6: docs and finish

- [ ] `release.md` and `architecture/overview.md` updated from "Planned" to shipped shape once a real run has succeeded (not before — don't mark this shipped on code-review alone, given how much of this can only truly be confirmed by GitHub Actions itself).
- [ ] `bsdd finish`. Ask before `bsdd sync`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `ubuntu-latest`'s WebKitGTK dev package name has changed since this assistant's knowledge cutoff | Linux build job fails on the apt-install step | Flagged explicitly in Phase 3; the workflow comment should say how to check/adjust (`apt-cache search webkit2gtk`) |
| Wails CLI `v2.12.0` becomes unavailable or has a known CI issue by the time this actually runs | Build fails to even start | Pin is based on this repo's actual `go.mod` today — correct as of this plan; if it needs bumping later, that's a `go.mod` decision, not a workflow one |
| Cross-repo token (`BCODE_RELEASE_TOKEN`) is missing, expired, or over/under-scoped | Publish job fails at the very last step, after 3 successful builds | Nothing this assistant can pre-empt beyond documenting the requirement clearly — flagged in Phase 4 and in `release.md`'s Security section |
| `git add -A` on the very first commit accidentally includes something that should have been gitignored | A large binary or generated tree gets baked into history from commit 1, hard to remove later | Phase 2 explicitly requires the user to review `git status` before committing, not just trust the `.gitignore` blindly |
| Rolling-`latest` release semantics differ slightly between release actions (some create a new release object per tag reuse, others truly update in place) | Old assets might linger alongside new ones, or the release notes/timestamp might look stale | Phase 4 names the specific options (`allowUpdates`, `replacesArtifacts`) needed for true in-place replacement — verify these exact behaviors once a second push happens, not just the first |

## Definition of Done

Per `.specs/tasks/release-pipeline.md`.
