---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-17
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: [0002]
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: Opening any file hangs the tab forever (no error, no content)

## Status

implemented (2026-10-17) — real root cause confirmed and fixed: Monaco Editor fetched from a CDN by default, hanging every file tab on "Loading..." when that fetch didn't resolve. See "Actual Root Cause" below. The AppImage/GIO hypothesis further down remains a separate, real, but secondary finding — not what the user was actually hitting.

## Goal

Opening **any** file in a workspace, in the installed/built app, never finishes: the tab the user expects stays stuck instead of showing content. Started happening recently (not present before); the user is unsure whether it's the machine or the app. Fix so opening a file either shows its content or shows a clear error — never hangs silently.

## Reported By User

- "a app quando vai abrir arquivos, fica em um eterno loading." (2026-10-17)
- Reproduction: every file, not just large/specific ones.
- Blast radius: only the file's own tab is affected; rest of the app (sidebar, terminal, other tabs) stays responsive.
- Regression: started recently; not always been like this.
- Environment: installed/built app (not `wails dev`).

## Linked Knowledge

- Module spec: `.specs/modules/files.md`
- ADR: `.specs/adrs/0002-local-json-persistence.md`

## Investigation So Far (2026-10-17, code read, not yet reproduced live)

- `FileExplorer.tsx`'s `openFile` does `const content = await ReadFile(node.path).catch(() => '')` then `openOrFocusTab(...)`. There is **no loading indicator anywhere in the open-file path** (`FileExplorer.tsx`, `EditorPane.tsx`, `EditorTabBar.tsx`, `MonacoEditor.tsx`, `editorStore.ts`) — so the user-visible "eterno loading" is not a spinner the code currently renders. Needs clarifying with the user: what exactly is shown (blank tab? tab title with a loading dot? app-wide overlay?) — screenshot would help.
- Backend `ReadFile` (`app.go`), `GetFileTree`, `GetFileInfo` are plain blocking `os.ReadFile`/`os.ReadDir`/`os.Stat` calls — **no timeout, no size cap, no context cancellation**. If the underlying call blocks (e.g. an unresponsive network/FUSE mount, antivirus/EDR intercepting file reads, a corrupted installed binary), the Wails-bound Promise on the frontend never resolves or rejects, and `.catch(() => '')` never fires because there's no rejection — just silence.
- Hypothesis A: the installed build is pointing at a workspace path that is no longer valid/reachable on this machine (stale state from `.specs/adrs/0002-local-json-persistence.md`'s local JSON persistence), making every `os.Stat`/`os.ReadFile` hang or error in a way the UI doesn't surface.
- Hypothesis B: something changed on the user's PC (OS update, antivirus, permissions) between "it worked" and now, unrelated to app code.
- Not yet confirmed: no live repro, no logs, no screenshot.

## Actual Root Cause And Fix (2026-10-17, confirmed after asking the user what literally appears on screen)

The user's exact symptom: clicking a file in the sidebar tree opens a tab that shows the literal text **"Loading..."** forever. That text pinpointed it immediately: `@monaco-editor/react`'s `<Editor>` (used by `MonacoEditor.tsx`) shows exactly that placeholder while its AMD loader is unresolved, and **by default this package fetches `monaco-editor` from a CDN (`cdn.jsdelivr.net`) at runtime** — there was no `loader.config` anywhere in the codebase pointing it at a local copy. Cortex is an offline desktop app; if that CDN fetch doesn't resolve inside the webview (network, DNS, proxy, or — plausibly, given the GIO/GVFS findings below — WebKit's own proxy-resolution module failing to load for the same AppImage-library reason), the loader promise never settles, and since it's the same shared loader instance across tabs, **every** file tab is stuck the same way, forever, while the rest of the app (sidebar, terminal) stays responsive. This matches 100% of what the user reported.

**Fix implemented 2026-10-17:**
- `frontend/src/monacoSetup.ts` (new) — sets `self.MonacoEnvironment.getWorker` using Vite's native `?worker` import for Monaco's five worker bundles (editor/json/css/html/typescript), and calls `loader.config({ monaco })` so `@monaco-editor/react` uses the locally bundled `monaco-editor` package instead of the CDN.
- Imported once in `frontend/src/main.tsx`, before `App` renders.
- `monaco-editor` (already present transitively via `@monaco-editor/react`) promoted to a direct dependency in `frontend/package.json`.
- Worker import paths had to skip the `esm/vs/` prefix (e.g. `monaco-editor/editor/editor.worker.js`, not `monaco-editor/esm/vs/editor/editor.worker.js`) — `monaco-editor@0.57`'s own `package.json` `exports` map already injects that prefix via `"./*.js": "./esm/vs/*.js"`; including it in the import specifier doubled it into a path that doesn't exist.
- `frontend/src/vite-env.d.ts` (new) added for `tsc` to recognize Vite's `?worker` import type (`/// <reference types="vite/client" />` — tsconfig had no `types` entry for it).
- Verified: `npm run build` (`tsc && vite build`) clean, Monaco's per-language chunks now appear in the build output as locally bundled assets, not fetched externally.
- **Not yet verified**: a live relaunch of the actual installed/built app confirming a file tab now opens without hitting the network at all. Should be checked once a new build is available to install.

## Secondary Finding (real, but not what the user was hitting): AppImage GIO/GVFS module shadowing (2026-10-17, live diagnosis on the user's machine)

Not a bug in app code. Confirmed via `ps`/`/proc`/`journalctl --user` on the running install:

1. **Several `cortex` processes were running at once** (started 08:56, 08:59, 09:19 the same morning) — the user had relaunched the app each time it seemed stuck, without killing the previous instance. Not the root cause by itself, but it compounds the symptom (multiple windows, confusing which one is "stuck").
2. **The real cause: AppImage-bundled GTK/glib/gnutls libraries are now older than the host's, breaking GIO module loading.** `journalctl --user` for this run shows repeated:
   - `libgvfscommon.so: undefined symbol: g_task_set_static_name` → `Failed to load module: .../libgvfsdbus.so`
   - `libdconfsettings.so: undefined symbol: g_assertion_message_cmpint`
   - `libgiognutls.so`: needs `GNUTLS_3_7_4`, not found
   - Confirmed by reading `/proc/<pid>/maps` of the running process: it loads `libglib-2.0.so.0` and `libgnutls.so.30` from inside the AppImage mount (`/tmp/.mount_cortexlHBPGm/usr/lib/`), not the host's. Host has `libglib2.0-0t64 2.80.0-6ubuntu3.9`, `libgnutls30t64 3.8.3-1.1ubuntu3.6` — both newer than whatever was frozen into the AppImage at build time (confirmed via `apt` history: both packages received Ubuntu point-release bumps since the AppImage was built).
   - This is the documented tradeoff from `.specs/tasks/linux-appimage-packaging.md`: the AppImage's `AppRun` sets `LD_LIBRARY_PATH` to its own bundled `usr/lib` so the bundled `libwebkit2gtk` closure is used instead of the host's (that fix was intentional, for a different bug — missing `libwebkit2gtk-4.0` on hosts without it). Side effect: *every* GIO/GVFS module the host tries to load against the app's process now resolves symbols against the **bundled**, frozen glib/gnutls instead of the host's newer ones, and fails when the host's system GIO modules (`libgvfsdbus.so`, `libdconfsettings.so`, `libgiognutls.so` — all **host** `.so` files, not bundled ones) expect newer glib/gnutls symbols.
3. **Why this hits "opening files" specifically**: `OpenDirectoryDialog` (`app.go:250`, bound in `frontend/src/App.tsx` and `WorkspaceList.tsx`) calls Wails' `runtime.OpenDirectoryDialog`, which on Linux is a native GTK file chooser. GTK's file chooser initializes GVFS (for "Recent", "Other Locations", bookmarks, etc.) — when GVFS's dbus/gnutls GIO modules fail to load for the reason above, the dialog can hang indefinitely instead of erroring, because GTK doesn't have a clean fallback/timeout for a GVFS module load failure mid-dialog-construction. This matches "sempre, qualquer arquivo" (every file) and "só a aba trava" loosely — in practice the user is likely hitting this on the folder/file picker itself, not inside an already-open tab.
4. Not yet re-tested after killing the duplicate processes and retrying with a single instance — should be done to confirm the dialog hang itself (not just the log errors) before closing this task.

## Definition Of Ready

- [x] Reproduce live (confirmed via logs + process inspection on the user's actual machine, 2026-10-17)
- [x] Confirm whether this is new-machine-specific — yes: it's an interaction between *this host's* current glib/gnutls point-release and the specific AppImage build the user has installed, triggered by routine Ubuntu security updates on the host (confirmed via `apt` history showing recent `libglib2.0-0t64`/`libgnutls30t64` point bumps)
- [x] Module boundaries known (files module's `OpenDirectoryDialog`, release/packaging module for the AppImage `LD_LIBRARY_PATH` tradeoff — see `.specs/modules/release.md`)
- [x] Related ADRs reviewed (0002)
- [x] Security implications identified (none)

## Acceptance Criteria

1. ✅ Opening any file in the sidebar shows its content without depending on network access — fixed by self-hosting Monaco (see above). Needs a real-app verification pass once a new build is installed.
2. (Still open, secondary front) If a native dialog or file read fails/hangs past a reasonable timeout, the UI surfaces a clear error instead of staying silently stuck.
3. (Still open, secondary front) Packaging fix for `AppRun`'s `LD_LIBRARY_PATH` shadowing host GIO modules — Option C (runtime detection) chosen in the plan, not yet implemented.
4. `release.md` updated with that packaging tradeoff once implemented.
5. Immediate user-facing workaround documented: quit all running `cortex` instances before relaunching, since duplicate instances were also found running simultaneously on this machine.

## Next Step

Verify the Monaco fix in a real rebuilt app (install the new build, open a file, confirm no "Loading..." hang and no network call to jsdelivr). The AppImage `LD_LIBRARY_PATH`/GIO packaging fix (Phases 1–2 of the plan) remains open as a separate, secondary piece of work — see `.specs/tasks/file-open-infinite-loading-plan.md`.
