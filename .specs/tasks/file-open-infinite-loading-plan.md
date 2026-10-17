---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-17
version: 1
connections:
  parent: .specs/tasks/file-open-infinite-loading.md
  children: []
  related_adrs: []
  sync_triggers:
    - Phase completion
    - Scope changes
---

# Plan: Fix AppImage GIO/GVFS module shadowing causing file-dialog hang

## Linked Knowledge

- Task: `.specs/tasks/file-open-infinite-loading.md`
- Module specs: `.specs/modules/release.md` (AppImage packaging, owns the fix), `.specs/modules/workspace.md` (owns `OpenDirectoryDialog`, the affected call — architecture overview lists it under `workspace`, not `files`; the earlier bug-report task/notes mis-attributed it to `files.md` and should be corrected there too)
- Architecture: `.specs/architecture/overview.md` (workspace module's public interface)
- Related history: `.specs/tasks/linux-appimage-packaging.md` (the `LD_LIBRARY_PATH`/binary-patch work that is the direct cause of this side effect)

## Execution Model

**Single agent.** User-confirmed 2026-10-17. Scope is one CI/packaging pipeline plus a small doc correction — no need for role division.

## Definition Of Ready (verified)

- [x] Root cause confirmed live on the user's machine (`.specs/tasks/file-open-infinite-loading.md`)
- [x] Affected module and interface identified (`release` module's AppImage build step; `workspace` module's `OpenDirectoryDialog`)
- [x] Related ADRs reviewed (none dedicated to AppImage packaging — tracked as Notes in `release.md`, consistent with past packaging decisions)
- [x] No security implications beyond what's already documented
- [x] Exact fix strategy chosen — Option C, runtime detection in `AppRun` (user-confirmed 2026-10-17)

## Scope Expansion (2026-10-17, user-confirmed)

Live testing during Phase 0 surfaced a second, broader instance of the same root cause: **any process run inside Cortex's own integrated terminal** (not just the native dialog) inherits `LD_LIBRARY_PATH`/`APPDIR`/`APPIMAGE`/`OWD` from `AppRun`, pointing at the AppImage's bundled libs instead of the host's. Reproduced directly: running `wails dev` *inside* Cortex's integrated terminal failed to link (`ld: libwebkit2gtk-4.1.so: referência não definida para gst_video_dma_drm_fourcc_from_format`) because `ldd` resolved GStreamer libs against the AppImage mount (`/tmp/.mount_cortex*/usr/lib`) instead of the system's. This is strictly a code-level fix (not an environment-detection decision like Phase 1/2 below) and has already been implemented — see **Phase 0.5**.

## Phases

### Phase 0 — Confirm the dialog-hang itself, not just the log signature (S)

- Kill all running `cortex` processes on the test machine, launch exactly one instance.
- Trigger `OpenDirectoryDialog` (Home → open folder) and confirm it actually hangs the dialog (not just logs the GIO warnings harmlessly) — the 2026-10-17 diagnosis read logs and library maps but did not watch the dialog itself fail to open.
- If the dialog does NOT hang once duplicates are gone, stop here and re-scope: the duplicate-instance finding might be the whole story, and the GIO errors could be harmless noise. Only proceed to Phase 1 if the hang reproduces with a single clean instance.
- Depends on: nothing. Blocks: everything else.

### Phase 0.5 — Fix integrated terminal env leakage (S) — DONE 2026-10-17

- Added `terminalEnv()` in `app.go`, filtering `LD_LIBRARY_PATH`, `APPDIR`, `APPIMAGE`, `OWD`, `ARGV0` out of `os.Environ()` before `StartTerminal`'s `pty.Start` — no behavior change on macOS/Windows (those vars are Linux-AppImage-only) or when not running from an AppImage at all (vars simply won't be present, filter is a no-op).
- `go build ./...` verified clean.
- Not yet re-verified end-to-end against a rebuilt AppImage running `wails dev` inside its own integrated terminal (needs a real build + relaunch to confirm the fix, not just unit-level compile) — tracked as a follow-up verification step, not blocking the rest of this plan.
- Docs: `.specs/modules/terminal.md` updated with this fix's Notes entry.
- Depends on: nothing (independent of Phase 1/2's AppRun decision). Does not block them either.

### Phase 1 — Choose the fix strategy (M)

**Chosen, user-confirmed 2026-10-17: Option C, runtime detection in `AppRun`.** Rejected alternatives kept below for the record.

- **C. (chosen) Runtime library selection in `AppRun`.** Before `exec`'ing the real binary, `AppRun` checks whether the host already has `glib`/`gnutls` at a compatible version (e.g. `ldconfig -p | grep -q libglib-2.0.so.0` plus a minimum-version check, or simply attempting to resolve the symbol the host's GIO modules need) and only adds the bundled `usr/lib` copies of **those two libraries** to `LD_LIBRARY_PATH` when the host is missing them or too old — never for `libwebkit2gtk`/`libjavascriptcoregtk`, which stay bundled unconditionally (that's the original 2026-09-30 bug this packaging exists to fix, and is not in question here). This means:
  - Host has compatible glib/gnutls (the common case, including this user's machine) → host's own GIO/GVFS modules load correctly, file dialog works, no behavior changes needed on future releases.
  - Host is missing or has an older glib/gnutls → fallback to the bundled ones, same behavior as today (hang risk from this bug would only resurface in that narrower case, which is strictly fewer machines than today's "always bundled").
  - No more manually flip-flopping what's bundled across releases — the decision is per-machine, at launch, automatically.
  - Needs a concrete version-compare mechanism: `ldconfig`'s output alone doesn't give a version, so the check likely needs either `strings`+symbol lookup on the host's `libglib-2.0.so.0` for the specific missing symbols seen in this bug (`g_task_set_static_name`, `g_assertion_message_cmpint`), or a simpler heuristic (`ldconfig -p` finds the host lib at all, assume modern distros are new enough — riskier, needs a decision during implementation, not during planning).
- **A. (rejected) Narrow `LD_LIBRARY_PATH` scope to WebKit's helper processes only.** Not controllable from `AppRun` alone — WebKit's helpers inherit whatever environment the main process has when WebKit spawns them, so there's no way to give the main process host libs while still giving WebKit's children the bundled ones through env alone.
- **B. (rejected, superseded by C) Exclude `glib`/`gnutls` from the bundled closure unconditionally.** Would have required re-verifying universality of host glib/gnutls across all target distros and committing to one fixed choice per release — C gets the same benefit without that risk, by deciding per machine instead of per release.
- Phase 2 still needs to reproduce the exact failure in a disposable Docker container with a newer host glib/gnutls than whatever's frozen in the current AppImage build (matching this session's live diagnosis), using the same verification method as `.specs/modules/release.md`'s 2026-10-03 entry, to validate the detection logic actually triggers the right branch in both directions (host-has-it vs. host-lacks-it).
- Depends on: Phase 0 confirming the hang is real.

### Phase 2 — Implement and verify (M)

- Add the runtime detection check to the `AppRun` patch step in `.github/workflows/release.yml` (same step that already `sed`-patches `cd`/`LD_LIBRARY_PATH` per `release.md`'s 2026-10-03 entry) — the check runs once at every launch, not at build time.
- Settle the version-check mechanism from Phase 1 (symbol-presence check vs. simpler `ldconfig`-exists heuristic) and implement it as shell in `AppRun`.
- Verify in two disposable Docker containers: one with host glib/gnutls matching or newer than the bundle (expect: bundled libs NOT added to `LD_LIBRARY_PATH`, host GIO modules load, no hang), one with an older/missing host glib/gnutls (expect: fallback to bundled libs, same behavior as today, webkit helpers still find `libwebkit2gtk` either way).
- Confirm the original missing-`libwebkit2gtk-4.0` crash does not reappear in either case (`libwebkit2gtk`/`libjavascriptcoregtk` are never touched by this conditional).
- Not yet re-verifiable on a real GitHub Actions run without pushing — note that limitation same as prior packaging fixes.
- Depends on: Phase 1's decision.

### Phase 3 — Docs and cleanup (S)

- `release.md`: add a dated Notes entry documenting this bug and the fix (or documented non-fix, if B turns out unsafe and A is also infeasible — in that case, document it as a known limitation and the recommended user workaround instead).
- Correct the module attribution mistake from the 2026-10-17 bug-report session: `OpenDirectoryDialog` belongs to `workspace`, not `files` — move/duplicate the relevant note into `.specs/modules/workspace.md` and trim `files.md`'s entry to a cross-reference.
- Update `.specs/tasks/file-open-infinite-loading.md` status to `done` (or `blocked`, if no safe fix exists) with final verification notes.
- Depends on: Phase 2.

## Risks / Open Questions

- The version-check mechanism itself (symbol-presence vs. simpler existence heuristic) is an implementation detail still open going into Phase 2 — needs a concrete choice backed by a container test, not assumed at planning time.
- A shell-level check in `AppRun` adds a small amount of startup latency and complexity to every launch — acceptable tradeoff given it removes the need to ever re-decide this at release time again.
- If the runtime check itself turns out unreliable (e.g. no robust way to detect the exact missing symbols from shell), fall back to Option B (exclude glib/gnutls unconditionally) as documented above, accepting its narrower risk.

## Next Step

`bsdd start` (or `bsdd run`) once this plan is approved, beginning at Phase 0.
