# Plan: Home icon + recently-closed-projects list

- Task: `.specs/tasks/home-icon-and-closed-projects.md`
- Modules: `usage.md`, `workspace.md`, `shell.md`
- ADR: none
- Execution model: **single agent**, phases in sequence
- Status: done

## Goal

Usage tab becomes "Home", first activity-bar icon. `WorkspaceList` gets a non-destructive "close" action (Archive icon) separate from the existing permanent delete (X), backed by a new capped 5-item "Recently Closed" list.

## Definition of Ready

- [x] Spec, criteria and decisions are current (task's "Decisions Already Made")
- [x] Touches only `workspace` (backend) and `shell`/`usage` (frontend icon/order)
- [x] No ADR needed

## Phases

| # | Phase | Size | Depends on |
|---|-------|------|------------|
| 1 | Backend: recently-closed list | S | none |
| 2 | Frontend: WorkspaceList close/reopen | M | 1 |
| 3 | Frontend: Home icon reorder + label | S | none |
| 4 | Verify | S | 2, 3 |
| 5 | Docs and finish | S | 4 |

### Phase 1: backend

- [x] `app.go`, workspace section: `recentClosedPath := filepath.Join(bcodeDir(), "recent_closed.json")`, same `[]Workspace` shape and read/marshal pattern as `GetRecentWorkspaces`/`recent.json` (empty-slice-not-nil, per the existing bug fix precedent in this codebase — reuse that exact pattern, do not reintroduce a nil-slice JSON `null`).
- [x] `GetRecentClosedWorkspaces() []Workspace`.
- [x] `CloseWorkspace(id string) error`: read `recent.json`, find and remove the entry with this id, read `recent_closed.json`, prepend the removed entry, cap at 5 (drop the oldest beyond 5), write both files.
- [x] In `SaveWorkspace` (the function that runs whenever a workspace is opened): after the existing logic, also remove `id`/`path` from `recent_closed.json` if present, so a workspace never sits in both lists — write only if it was actually present, to avoid needless disk writes.
- [x] `wails generate module` once these three are in place.

### Phase 2: WorkspaceList close/reopen

- [x] `workspaceStore.ts`: add `recentClosedWorkspaces: Workspace[]` and `setRecentClosedWorkspaces`, mirroring `recentWorkspaces`.
- [x] `WorkspaceList.tsx`: fetch `GetRecentClosedWorkspaces` alongside `GetRecentWorkspaces` on mount and after any list-changing action (open, close, delete).
- [x] Add a "close" button per `Recent` row using `Archive` from `lucide-react` (distinct from the existing `X` delete button — keep both, different icons, different `title` tooltips: "Close" vs "Remove from list"), calling `CloseWorkspace(id)` then refreshing both lists.
- [x] Render a `Recently Closed` section (same `section-label`/`workspace-item` styling as `Recent`) below it, only when non-empty, each item calling the existing `handleSelect`/`onOpenWorkspace` — opening it naturally re-adds to `recent.json` and (per phase 1) removes it from the closed list, so no special "restore" branch is needed in the frontend.
- [x] Keep the existing hard-delete (`RemoveWorkspace`) working from both sections (a closed item can still be permanently deleted); after deleting, refresh both lists so it disappears from whichever it was in.

### Phase 3: Home icon

- [x] `ActivityBar.tsx`: move the usage/bar-chart button to be the first child, before Explorer. Change its icon to `Home` (from `lucide-react`, already available) and its `title` to `"Home"`. Decide whether to also rename the internal `openUsageTab`/`isUsageTab` identifiers — the task allows leaving them as-is if renaming adds risk without user-visible benefit; note the choice made.
- [x] `UsageTab.tsx` header: update the visible title/icon from "Usage" to "Home" to match (keep the existing chart/recent-projects content unchanged — this phase is only the label and icon, not new content).

### Phase 4: verify

- [x] `go build ./...`, `npm run build` pass.
- [x] Backend behavior (not `wails dev` — an automated Go test): open 3 workspaces, close one, confirm `recent`/`recent_closed` counts; reopen it by path, confirm it moves back and reuses its id (caught a real bug here, fixed — see task); close 6 more, confirm the cap at 5; permanently delete one from the closed list, confirm it's gone. `wails dev` interactive click-through **not performed by the assistant** — recommend the user confirm visually before treating this as fully verified.
- [x] Home icon position/label/icon confirmed by code read and successful build; **not** visually confirmed in a running window by the assistant.

### Phase 5: docs and finish

- [x] Update `usage.md`, `workspace.md` from "Planned" to shipped shape (drop the "(planned)" markers added during `bsdd new`).
- [x] `bsdd finish`. Ask before `bsdd sync`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| A workspace ends up in both lists (race between close and reopen) | Confusing duplicate entries | Phase 1's `SaveWorkspace` purge step runs on every open, not just a dedicated "restore" path |
| Reintroducing the nil-slice-to-JSON-`null` bug fixed earlier this session | Same crash class as the ActivityBar/git-graph incident | Explicitly copy the fixed `GetRecentWorkspaces` pattern (`ws := []Workspace{}` + nil-check) for the new list, not the original unfixed style |
| Confusing close vs delete icons | User deletes when they meant to close | Distinct icons (Archive vs X) and distinct tooltips, called out explicitly in phase 2 |

## Definition of Done

Per `.specs/tasks/home-icon-and-closed-projects.md`.
