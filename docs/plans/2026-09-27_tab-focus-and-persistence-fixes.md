# Plan: Fix Ctrl+Shift+Tab focus loss and open-files-not-restored bugs

- Task: `.specs/tasks/tab-focus-and-persistence-fixes.md`
- Modules: `shell.md`, `files.md`, `workspace.md`
- ADR: none
- Execution model: **single agent**, phases in sequence
- Status: in-progress

## Goal

Fix two reliability bugs: (1) Ctrl/Cmd+Shift+Tab (and likely the forward direction) only works once, until the user clicks inside an open file; (2) files left open when the app closes are not restored on the next launch.

## Definition of Ready

- [x] Spec, criteria and decisions are current (task's Root Cause Analysis)
- [x] Touches `shell`/`files` frontend (focus handling), `workspace` backend + frontend (close lifecycle, save timing)
- [x] No ADR needed — confirmed `OnBeforeClose`/`runtime.Quit` exist in the vendored Wails v2.12.0 API before committing to this fix design

## Phases

| # | Phase | Size | Depends on |
|---|-------|------|------------|
| 1 | Focus retention after tab switch | M | none |
| 2 | `OnBeforeClose` + `ConfirmQuit` save-before-quit | M | none |
| 3 | Verify | M | 1–2 |
| 4 | Docs and finish | S | 3 |

### Phase 1: focus retention after tab switch

- [x] `EditorPane.tsx`: pass `onEditorMount={(editor) => editor.focus()}` to its `MonacoEditor` (the plain-file editor, already `key={activeTab.id}`-remounted on every tab switch, so `onMount` firing once per switch is guaranteed there).
- [x] `QueryTab.tsx`: add `useEffect(() => { editorRef.current?.focus() }, [tab.id])` — its internal `MonacoEditor` is not guaranteed to remount on a query-tab-to-query-tab switch (no per-tab `key`), so mount-based focus alone would miss that case; `editorRef` already exists from `handleEditorMount`.
- [x] `EditorPane.tsx`: add a `tabIndex={-1}` ref on its outer wrapping container (with a CSS rule to suppress the visible focus outline) and a `useEffect` keyed on `useEditorStore(s => s.activeTabId)` that calls `containerRef.current?.focus()` whenever the newly active tab has no Monaco instance at all (`isUsageTab`, `isGraphTab`, `isCommitTab`, or no active tab). This guarantees the webview always has *some* focused DOM element after any switch, regardless of tab type — the actual fix for the reported symptom.
- [x] Sanity-check this doesn't fight with the existing Cmd+S handler in `EditorPane.tsx` or steal focus away from an input the user is actively typing in elsewhere (e.g. a rename input in `FileExplorer.tsx`/`DatabasePanel.tsx`) — the effect should only run on `activeTabId` change, not on every render, so it shouldn't fire while the user is mid-rename in the sidebar (that doesn't change `activeTabId`).

### Phase 2: save-before-quit

- [x] `main.go`: add `OnBeforeClose: app.beforeClose` to `options.App`.
- [x] `app.go`: add `func (a *App) beforeClose(ctx context.Context) bool { runtime.EventsEmit(ctx, "app:before-close"); return true }` and `func (a *App) ConfirmQuit() { runtime.Quit(a.ctx) }`.
- [x] `App.tsx`: listen for `"app:before-close"` via `EventsOn` (from `wailsjs/runtime/runtime`); on receipt, look up `useWorkspaceStore.getState().currentWorkspace`, `await persistCurrentWs(ws)` if present, then call the new `ConfirmQuit()` bound method. Race this against a ~2s timeout that calls `ConfirmQuit()` regardless, so a hung/rejected save can never make the window permanently unclosable.
- [x] Remove the now-redundant `beforeunload`-based save handler in `App.tsx` — `OnBeforeClose` is the reliable native hook; keeping both risks a confusing double-save path and `beforeunload` may not even fire reliably for a native window-close in the first place (part of why this bug exists).
- [x] While touching `persistCurrentWs`: tighten its `openFiles` filter to also exclude `isUsageTab`/`isQueryTab` tabs (today only `isCommitTab`/`isGraphTab` are excluded) — their fake paths (`__usage__`, `__query_...__`) don't belong in a file-restore list.
- [x] `wails generate module` after adding `ConfirmQuit`.

### Phase 3: verify

- [x] `go build ./...`, `npm run build` (tsc + vite) both pass clean.
- [ ] `wails dev`, by hand: **not verified** — cycling tabs with the keyboard only across mixed types, and a real close-and-relaunch cycle, both require interacting with a running window, which this assistant cannot do.
- [x] Recorded explicitly above which parts are code-verified only vs. actually clicked through (none of the latter), per this project's established honesty practice on GUI-only criteria.
- [x] **Regression found and fixed during this same verification window (user report, 2026-09-27)**: Phase 2's `beforeClose` unconditionally returned `true`, which broke window closing entirely (the custom `TitleBar.tsx` close button calls `runtime.Quit()`, which — confirmed by reading the vendored Wails v2.12.0 Linux frontend source — re-checks `OnBeforeClose` on every call, so `ConfirmQuit`'s own `runtime.Quit()` call re-triggered its own prevention, forever). Fixed with a `quitConfirmed` flag on `*App`, the standard pattern this hook is designed around. See `workspace.md`'s updated note.

### Phase 4: docs and finish

- [x] `shell.md`, `files.md`, `workspace.md` updated from "Planned" to shipped shape.
- [ ] `bsdd finish`. Ask before `bsdd sync`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| The GTK-focus-loss hypothesis for Bug A is wrong, and the real cause is something else entirely | Fix doesn't actually resolve the symptom | The fix (always ensure something is focused after a switch) is a correct, defensive improvement regardless of the precise cause, and is low-risk to ship even if it turns out not to be the *whole* story — flag clearly in the task/plan that this needs the user's real-world retest |
| `OnBeforeClose` returning `true` unconditionally could make the window impossible to close if the frontend never responds (e.g. JS crashed) | User stuck unable to quit the app | The 2s safety timeout race in Phase 2 always calls `ConfirmQuit()` eventually, even if the save/event plumbing fails silently |
| Removing the `beforeunload` handler loses a save path that happened to work for some close paths (e.g. Cmd+Q on macOS might behave differently than the X button) | Regression on a platform this assistant can't test | Flag explicitly in Phase 3 that only Linux (Wails dev) is verifiable in this session; ask the user to confirm on macOS/Windows if they use those |
| Forcing focus onto the container after every tab switch interferes with some other in-progress input focus | Minor UX annoyance (cursor jumps away from something the user was typing in) | The effect only runs on `activeTabId` change, not other state changes, and rename/create inputs don't change `activeTabId` — should be safe, but call out in the manual verification checklist |

## Definition of Done

Per `.specs/tasks/tab-focus-and-persistence-fixes.md`.
