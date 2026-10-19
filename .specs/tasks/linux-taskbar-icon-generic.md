---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-18
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

# Task: Linux app shows a generic gear icon in the taskbar and alt-tab

## Status

in-progress

## Goal

On Ubuntu/GNOME, the running Cortex window shows a generic gear icon ("application-x-executable") instead of the real app icon, both in the Dash/taskbar and in alt-tab. User-reported, 2026-10-18, with a screenshot of the running app.

A prior, related fix shipped 2026-10-14 (`.specs/modules/release.md` Notes) made `cortex.sh` install a real icon file under `~/.local/share/icons/hicolor/512x512/apps/cortex.png` with `Icon=cortex` in the generated `.desktop`, specifically because the installer used to fall back to the generic icon when no icon asset existed. The user is still seeing the generic icon after that fix shipped, so this is either:
- a reinstall gap (user's existing install predates the 2026-10-14 fix and hasn't re-run `cortex.sh`), or
- a second, independent cause: `build/linux/cortex.desktop` (this repo) has no `StartupWMClass`, and GNOME Shell resolves the Dash/alt-tab icon by matching the running window's `WM_CLASS` against installed `.desktop` entries — if the Wails/GTK window's `WM_CLASS` doesn't match the installed desktop file's id, GNOME falls back to a generic icon even when `Icon=cortex` is correctly set and the icon file is present (this is distinct from the GTK window-decoration icon set via `options.App.Linux.Icon` in `main.go`, which is already correct).

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Architecture: `.specs/architecture/overview.md`
- Module specs: `.specs/modules/release.md`
- Area: `.specs/areas/desktop-window.md`

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries are known (release/packaging: `.desktop`, icon assets, installer)
- [x] Related ADRs reviewed (none apply)
- [x] Security implications identified (none)

## Acceptance Criteria

1. Confirm root cause on a real Ubuntu/GNOME machine: check whether the installed `.desktop` file and icon file match the 2026-10-14 fix (reinstall gap), and separately check the running window's reported `WM_CLASS` against `build/linux/cortex.desktop`'s filename/id.
2. If `WM_CLASS` mismatch is confirmed: set `StartupWMClass` in `build/linux/cortex.desktop` to match the actual window class Wails/GTK reports (and/or set the window class explicitly in `main.go`/`window_options.go` if Wails exposes that option), so GNOME resolves the correct icon for Dash and alt-tab.
3. Taskbar/Dash and alt-tab both show the real Cortex icon after a fresh install via `cortex.sh`, with no manual icon-cache steps beyond what the installer already runs.
4. Document findings (root cause, which of the two causes applied, or both) in `.specs/modules/release.md` Notes once resolved.

## Implementation Notes

- This repo owns `build/linux/cortex.desktop`, `build/appicon.png`, and the window icon option in `main.go`. The installer (`cortex.sh`) lives in the sibling `freeskills` project, out of this repo's boundary — any installer-side fix needs a separate change there, same split as the 2026-10-14 fix.
- Verify with a real GNOME session (Xvfb/manual VM), not just file inspection — `WM_CLASS` behavior is runtime, not something `grep` on source confirms.
- No Inbox/Outbox, no migrations.

## Definition Of Done

- [ ] Acceptance criteria met
- [ ] Tests or verification completed
- [ ] Knowledge documents updated
- [ ] ADRs created/updated if needed
- [ ] Sync Review completed if source docs changed
