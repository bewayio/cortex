---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-01
version: 4
connections:
  parent: .specs/modules/release.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Linux AppImage packaging

## Status

`in-progress` — see `.specs/tasks/linux-appimage-packaging-plan.md`

## Goal

Replace the plain `bcode-linux-amd64.tar.gz` release asset with a self-contained AppImage so the Linux binary carries its own shared-library closure (notably `libwebkit2gtk-4.0`) instead of depending on the host system having it installed.

## Background

Reported 2026-09-30: running the current Linux binary fails with `error while loading shared libraries: libwebkit2gtk-4.0.so.37: cannot open shared object file: No such file or directory` on systems without that exact package installed. Confirmed by the user as the same moving-target dependency already seen during the CI build fix (Ubuntu 24.04 ships `-4.1`, not `-4.0`). Decision: bundle via AppImage rather than declare/install a system dependency. See `.specs/modules/release.md` Notes for full rationale and rejected alternatives (.deb with declared deps, install-script-installs-the-lib).

## Acceptance Criteria

- [ ] Linux matrix job in `.github/workflows/release.yml` runs `linuxdeploy` (with the `appimage` plugin, or `appimagetool`) after `wails build` to produce one `.AppImage` file that embeds the binary and its full shared-library closure, including `libwebkit2gtk-4.0`.
- [ ] The produced AppImage launches and runs correctly on a Linux system that does **not** have `libwebkit2gtk-4.0` installed system-wide (clean-environment verification, not just "it built").
- [ ] Release asset renamed from `bcode-linux-amd64.tar.gz` to `bcode-linux-x86_64.AppImage` (AppImage's own naming convention) everywhere it's referenced: the workflow's asset upload step, `checksums.txt` generation, and any existing docs/specs that name the old filename.
- [ ] The "always latest" stable download URL for Linux (`.../releases/latest/download/bcode-linux-amd64.tar.gz`) is updated to the new AppImage filename, including in `.specs/modules/release.md`'s Notes where it's currently documented.
- [ ] `checksums.txt` still contains one sha256 line per platform asset, now reflecting the AppImage instead of the tarball.
- [ ] The launched AppImage spawns `WebKitNetworkProcess`/`WebKitWebProcess` from the bundled copy, not the system path — fixed 2026-10-01 (libexec dir bundled by hand + `WEBKIT_EXEC_PATH` via an `apprun-hooks` script), not yet re-verified on a real run.
- [ ] A real CI run on `bewayio/code` confirms the Linux job builds and publishes the AppImage successfully (this module's Notes already show two prior Linux/macOS CI bugs, plus this WebKitNetworkProcess one, that only surfaced on a real run, not locally).

## Affected Modules

- `release` (primary — see `.specs/modules/release.md`)

## Out of Scope

- macOS and Windows packaging (unaffected by this change).
- The `.sh` install script itself (separate, not yet started — see `.specs/modules/release.md` Notes, 2026-09-30 entry on stable download URLs). Its Linux download URL will need the new filename once it exists, but writing the script is not part of this task.
- Code signing/notarization for any platform (already out of scope per this module's Notes).

## Next Step

Run `bsdd plan` to turn this into an ordered implementation plan.
