---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-26
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

# Task: Home icon + recently-closed-projects list

## Status

done (2026-09-26), **partially superseded 2026-09-27**: the "recently closed" list and its explicit Archive/close action, delivered by this task, were replaced the next day by a simpler two-list model ("Open projects" + "Ever opened", no close action) per direct user request. See `.specs/tasks/quick-navigation-and-shortcuts.md` and `.specs/modules/workspace.md`. The Home-icon-reorder part of this task is unaffected and still stands.

## Goal

The Usage tab becomes the "Home" tab: first icon in the activity bar, opened by default. Add an explicit "close" action on a recent-project entry (distinct from the existing permanent-delete action) that moves it into a separate, 5-item "Recently Closed" list; reopening a closed project moves it back to the regular recent list.

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Module specs: `.specs/modules/usage.md`, `.specs/modules/workspace.md`, `.specs/modules/shell.md`
- Related task: `.specs/tasks/sidebar-usage-panel.md` (the tab this renames/reorders)

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries known (`workspace` module gets one new list + method; `usage`/`shell` for the icon)
- [x] Related ADRs reviewed (none apply)
- [x] Security implications identified (none — same local JSON pattern as `recent.json`)

## Decisions Already Made (2026-09-26, with the user)

1. **What "closed" means**: an explicit action on a list entry ("close"), distinct from opening a different folder and distinct from the existing permanent "remove from list" (trash icon). Closing removes the item from the regular recent list and puts it in a separate "recently closed" list (max 5), without deleting the workspace's own saved state (open files, etc.) or making it any harder to reopen.
2. **AI session state**: explicitly out of scope — "deixe esse controle para os clients" (the user wants `claude`/`codex` to handle their own session resumption; BCode does nothing beyond opening a terminal in the right directory, which it already does). Do not build session-resume logic.
3. Both changes apply to `WorkspaceList.tsx` wherever it is used (the sidebar's always-on-top section and the Home tab), since it is one shared component — not a Home-tab-only special case.

## Acceptance Criteria

### Home icon

1. The icon that opens the usage/stats tab is the first icon in the `ActivityBar`, before Explorer and Git, and reads as "Home" (title/tooltip), not "Usage" — rename in the UI without needing to rename `UsageTab.tsx`/`isUsageTab` internally unless the implementer judges the rename worth doing for clarity (note the choice either way).
2. Existing behavior (singleton tab, opens/focuses via `openOrFocusTab`) is unchanged — only its position and label change.

### Recently closed projects

3. Each entry in `WorkspaceList` gets a new "close" control, alongside (not replacing) the existing permanent-delete control. Tooltips/icons must not be confusable — closing is reversible and non-destructive, deleting is not.
4. Closing an entry removes it from the regular recent list and adds it to a "Recently Closed" list, most-recently-closed first, capped at 5 (evict the oldest beyond 5).
5. Closing a workspace does not delete `~/.bcode/workspaces/{id}.json` (its open-files/view-mode state) — that state is exactly what makes reopening it later meaningful.
6. `WorkspaceList` renders a "Recently Closed" section (only when non-empty) below "Recent", same visual style, each entry still opens the workspace on click.
7. Opening a workspace from the "Recently Closed" section removes it from that list and lets it reappear in the regular recent list, via the normal open-workspace path (no special-cased "restore" flow needed if `SaveWorkspace`/opening already re-adds to `recent.json` — just also purge it from the closed list at that point).
8. If a workspace is permanently deleted (existing trash action) while it happens to be in the closed list, it disappears from both lists, not just one.

## Implementation Notes

- **Backend** (`app.go`, workspace section): add `recent_closed.json` under `bcodeDir()`, same array-of-`Workspace` shape as `recent.json`. New methods: `GetRecentClosedWorkspaces() []Workspace`, `CloseWorkspace(id string) error` (move from recent to closed, cap at 5), and extend `SaveWorkspace`/opening flow to remove the id from the closed list if present (a workspace should never sit in both lists at once).
- **Frontend**: `workspaceStore.ts` gets `recentClosedWorkspaces` state, `WorkspaceList.tsx` renders the new section and the new close button (a distinct icon from the existing `X`, e.g. an "eject"/minus-circle icon from `lucide-react` already in use elsewhere in the app), calling the new backend methods and refreshing both lists after any change (open, close, delete).
- **Home icon**: `ActivityBar.tsx` reorder — move the usage button to be the first child; update its `title`. Confirm no keyboard-shortcut collision from being first (there is none registered for panel order today).
- Do not implement any Claude/Codex session-resume logic (decision 2 above) — if a future request wants that, it needs its own `bsdd new` pass to establish what is actually possible given these CLIs' own external session storage.

- Plan: `docs/plans/2026-09-26_home-icon-and-closed-projects.md`. Next command: `bsdd start`.

## Definition Of Done

- [x] Acceptance criteria 1–8 verified: automated test (`SaveWorkspace`/`CloseWorkspace`/`RemoveWorkspace` round trip, cap at 5, reopen-by-path reuses id and purges from closed) plus a rendered static preview of the two-button `WorkspaceList` layout (no overlap, distinct icons). Full interactive `wails dev` click-through not run by the assistant.
- [x] `usage.md`, `workspace.md`, `shell.md` updated to the shipped shape
- [ ] Sync Review completed if source docs changed (pending `bsdd sync`)
