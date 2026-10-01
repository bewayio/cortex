---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-01
version: 1
connections:
  parent: .specs/tasks/linux-appimage-packaging.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: Linux AppImage packaging

## Linked Task

`.specs/tasks/linux-appimage-packaging.md` → status set to `planned` by this plan.

## Execution Model

**Single agent.** Scope is one workflow file (`.github/workflows/release.yml`) plus checksum/filename references in `.specs/modules/release.md`. No parallelizable surface that would justify orchestrator overhead.

## Definition of Ready — confirmed

- Project DNA, architecture overview, and `.specs/modules/release.md` read.
- Task linked to the module spec; acceptance criteria are testable.
- No cross-module boundary crossed (release module only).
- No blocking tasks pending.

## Phases

### Phase 1 — Add AppImage tooling to the Linux job (S)

- In the `build` job's Linux matrix entry, after the existing `wails build` step, add a step that downloads `linuxdeploy-x86_64.AppImage` and the webkit/gtk-aware plugin it needs (or `appimagetool` directly if `linuxdeploy`'s GTK plugin doesn't cover webkit2gtk cleanly — verify during implementation which resolves the `.so.37` dependency into the bundle).
- Point it at `build/bin/bcode` as the `AppDir`'s main executable; let it auto-detect shared library dependencies via `ldd`, which is `linuxdeploy`'s default behavior.
- Dependency: none (first phase).

### Phase 2 — Replace the tarball packaging step with AppImage output (S)

- Replace the existing `Package (Linux)` step (`tar -czf ...`) with the `linuxdeploy`/`appimagetool` invocation that emits `bcode-linux-x86_64.AppImage`.
- Update `matrix.asset` for the Linux entry from `bcode-linux-amd64.tar.gz` to `bcode-linux-x86_64.AppImage`.
- Checksum and `upload-artifact` steps are asset-name-driven already (`${{ matrix.asset }}`) — no change needed beyond the matrix value.
- Dependency: Phase 1.

### Phase 3 — Update downstream references to the new filename (S)

- `.specs/modules/release.md`: update the "always latest" stable URL list (currently `.../bcode-linux-amd64.tar.gz`) to the new `.../bcode-linux-x86_64.AppImage`.
- Grep the repo for any other reference to `bcode-linux-amd64.tar.gz` (docs, README, install-script notes) and update them.
- No cask changes needed — the Homebrew cask only ever referenced the macOS asset.
- Dependency: Phase 2.

### Phase 4 — Verify on a real CI run, on a clean environment (M)

- Push to `main` (or `workflow_dispatch`) and confirm the Linux job produces a valid `.AppImage` artifact and the `publish` job includes it in the release + `checksums.txt`.
- Download the published AppImage on a Linux environment without `libwebkit2gtk-4.0` installed (a fresh container/VM, not the dev machine) and confirm it launches — this is the actual acceptance bar, not just a successful build. This module's Notes already show two prior cases where the local build passed but a real CI/runtime environment surfaced the actual bug.
- Dependency: Phases 1–3.

## Complexity Summary

| Phase | Complexity |
|-------|-----------|
| 1. Add AppImage tooling | S |
| 2. Replace packaging step | S |
| 3. Update downstream references | S |
| 4. Verify on real CI + clean environment | M |

## Out of Scope

Unchanged from the linked task: macOS/Windows packaging, the `.sh` install script itself, code signing/notarization.

## Next Step

Run `bsdd start` (or `bsdd run`) to begin Phase 1.
