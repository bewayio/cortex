---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-18
version: 1
connections:
  parent: .specs/tasks/linux-taskbar-icon-generic.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: Linux taskbar/alt-tab shows generic icon

## Linked Task

`.specs/tasks/linux-taskbar-icon-generic.md` → status set to `planned` by this plan.

## Execution Model

**Single agent.** Scope is a `.desktop` file, an icon asset, and a window-class option, split across two small repos (this one + the sibling `freeskills` installer). No parallelizable surface that would justify orchestrator overhead.

## Definition of Ready — confirmed

- Project DNA, architecture overview, and `.specs/modules/release.md` read.
- Task linked to the module spec; acceptance criteria are testable on a real GNOME session.
- No cross-module boundary crossed inside this repo (release module only); the installer-side half is explicitly out of this repo's boundary, same split as the 2026-10-14 fix.
- No blocking tasks pending.

## Phases

### Phase 1 — Diagnose on a real Ubuntu/GNOME session (S)

- Confirm whether the user's install actually has the 2026-10-14 fix (icon file under `~/.local/share/icons/hicolor/512x512/apps/cortex.png`, `Icon=cortex` in the installed `.desktop`) — rules out a plain reinstall gap.
- With the app running, inspect the window's reported class (`xprop WM_CLASS` or `wmctrl -lx`) and compare it to the installed `.desktop` file's id/`Exec` name.
- Record which cause(s) are present: reinstall gap, `WM_CLASS` mismatch, both, or neither (in which case escalate — something else is going on).
- Dependency: none (first phase).

### Phase 2 — Fix the confirmed cause(s) (S)

- If `WM_CLASS` mismatch: set `StartupWMClass` in `build/linux/cortex.desktop` to match the actual class Wails/GTK reports (check if Wails' `options.App.Linux` exposes a way to set the window class explicitly; if not, match the `.desktop` to whatever default Wails/GTK already produces).
- If the sibling `freeskills/cortex.sh` installer also writes a `.desktop` file, apply the same `StartupWMClass` value there so freshly installed and upgraded instances match — this half lives outside this repo and needs its own small change there.
- If reinstall gap only: no source change needed here; note it as a user-education/README point instead.
- Dependency: Phase 1.

### Phase 3 — Verify on a fresh install (M)

- Simulate a clean install (fresh `cortex.sh` run against a throwaway `$HOME`, or a disposable container/VM with a GNOME session) and confirm the Dash/taskbar icon and alt-tab icon both show the real Cortex icon, not the generic gear.
- Confirm the existing 2026-10-14 icon-file behavior (fallback to generic icon if the icon asset/checksum fails) is untouched.
- Dependency: Phase 2.

### Phase 4 — Document and close out (S)

- Record the confirmed root cause and fix in `.specs/modules/release.md` Notes, replacing the 2026-10-18 "reported again" entry with the resolved outcome.
- Mark `.specs/tasks/linux-taskbar-icon-generic.md` `done` once verified.
- Dependency: Phase 3.

## Complexity Summary

| Phase | Complexity |
|-------|-----------|
| 1. Diagnose on real GNOME session | S |
| 2. Fix confirmed cause(s) | S |
| 3. Verify on fresh install | M |
| 4. Document and close out | S |

## Out of Scope

Any other packaging concern already covered by `.specs/modules/release.md` (AppImage bundling, code signing, Windows/macOS icons).

## Next Step

Run `bsdd start` (or `bsdd run`) to begin Phase 1.
