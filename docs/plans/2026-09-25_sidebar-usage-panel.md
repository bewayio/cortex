# Plan: Usage sidebar panel (Claude Code token usage + recent projects)

- Task: `.specs/tasks/sidebar-usage-panel.md`
- Module (new): `.specs/modules/usage.md`
- ADR: none (see phase 3 note on charting library)
- Execution model: **single agent**, phases in sequence
- Status: done, corrected 2026-09-26 — see "Correction (2026-09-26)" in the task file. Delivered as a sidebar panel first; the user wanted an editor tab (VS Code Welcome-tab style) instead. Reworked to `components/UsageTab.tsx` opened via the existing singleton-tab pattern (`isGraphTab`/`isUsageTab`), not a `Panel` value. This plan's phases below describe the original (sidebar) build; the task file has the corrected implementation notes.

## Goal

Fourth activity-bar icon opens a panel: Claude Code token usage chart (day/week/month toggle) on top, recent-projects list below, reusing existing data.

## Definition of Ready

- [x] Spec, criteria and decisions are current (`sidebar-usage-panel.md` "Decisions Already Made")
- [x] Real data format confirmed on this machine (`~/.claude/projects/*.jsonl`)
- [x] No ADR needed unless a chart library is added

## Phases

| # | Phase | Size | Depends on |
|---|-------|------|------------|
| 1 | Backend: `GetClaudeTokenUsage` | M | none |
| 2 | Frontend: plumb the 4th panel | S | none |
| 3 | Frontend: `UsagePanel` chart + grouping | M | 1, 2 |
| 4 | Frontend: recent-projects section reuse | S | 2 |
| 5 | Verify | M | 3, 4 |
| 6 | Docs and finish | S | 5 |

### Phase 1: backend

- [x] Add to `app.go` (or a new `usage.go` if convenient — same package, no boundary change either way):
  - Types: `DailyUsage { Date string; InputTokens, OutputTokens, CacheCreationTokens, CacheReadTokens int64 }` (JSON tags matching this naming for the frontend).
  - `GetClaudeTokenUsage() ([]DailyUsage, error)`:
    - `home, _ := os.UserHomeDir()`; base := `filepath.Join(home, ".claude", "projects")`.
    - If base doesn't exist, return `[]DailyUsage{}, nil` (acceptance criterion 5 — empty state, not an error).
    - `filepath.WalkDir` for `*.jsonl` files.
    - Per file: `bufio.NewScanner` with an increased buffer (`scanner.Buffer(make([]byte, 0, 1<<20), 1<<24)` — some lines are multiple MB, per the 5.4MB/1926-line file inspected in `bsdd new`).
    - Per line: cheap pre-check `strings.Contains(line, "\"type\":\"assistant\"")` before a full `json.Unmarshal`, to skip most lines fast (user/tool-result lines are the majority and don't have `usage`).
    - Unmarshal only the needed shape: `{ Type string; Timestamp string; Message struct { Usage *struct{ InputTokens, OutputTokens, CacheCreationInputTokens, CacheReadInputTokens int64 } } }`.
    - Skip lines that fail to parse (partial/corrupt trailing line from a crashed session) — do not abort the whole scan.
    - Parse `Timestamp` (RFC3339) in UTC, bucket key = `2006-01-02` (UTC) per the module spec's documented choice.
    - Accumulate into a `map[string]*DailyUsage`, then produce a sorted-by-date slice.
  - No caching layer in this version — acceptable per the 89MB/9-project real-world measurement (phase 5 confirms actual timing).

### Phase 2: plumb the 4th panel

- [x] `frontend/src/App.tsx`, `components/ActivityBar.tsx`, `components/Sidebar.tsx`: the `Panel` type (`'explorer' | 'git'`, duplicated in all three files today) becomes `'explorer' | 'git' | 'usage'`.
- [x] `ActivityBar.tsx`: add a fourth button using `BarChart2` from `lucide-react` (already available, no new dependency), same style as the other two panel buttons (not the terminal-toggle button, which is a separate action, not a panel).
- [x] `Sidebar.tsx`: when `activePanel === 'usage'`, render the new `UsagePanel` instead of `FileExplorer`/`GitPanel`, and **skip** the shared `sidebar-workspace-section`/`WorkspaceList` block for this panel only (per the task's layout decision — `UsagePanel` has its own recent-projects section in the right order). Header label: `USAGE` (or similar), matching the `EXPLORER`/`SOURCE CONTROL` pattern.
- [x] `wails generate module` after phase 1's Go method exists, before starting phase 3.

### Phase 3: `UsagePanel` chart

- [x] New `frontend/src/components/UsagePanel.tsx`.
- [x] Call `GetClaudeTokenUsage()` once on mount (loading state while pending; empty state if the result is `[]`).
- [x] Grouping toggle (day/week/month) as local component state; group the day-level results client-side:
  - week: ISO week (or simple 7-day buckets from the oldest date — pick one, document it in a code comment, ISO week recommended for predictability).
  - month: calendar month (`YYYY-MM`).
- [x] Chart: hand-rolled SVG/CSS bar chart (default per the task; no new npm dependency), stacked or grouped bars for input/output/cache-read/cache-creation, or a simpler single "total tokens" bar per bucket with a legend breakdown on hover/tooltip — pick the simpler single-metric-with-breakdown version first if time-constrained, note the choice.
- [x] Before finalizing colors/legend/tooltip style, load the `dataviz` skill if the executing session has it available, and follow its palette guidance instead of picking colors ad hoc.
- [x] If, during implementation, hand-rolling proves clearly worse than a tiny library (for example real date-bucketing/zoom needs), stop and flag it — adding a dependency needs a `project-dna.md` Technology Stack update and is a scope change from this plan, not a silent substitution.

### Phase 4: recent-projects reuse

- [x] Inside `UsagePanel.tsx`, below the chart, render the existing `WorkspaceList` component (or extract its list-rendering into a shared sub-component if `WorkspaceList` is too tied to being "the thing above every panel" — prefer reusing the component as-is first, only refactor if it doesn't fit).
- [x] Confirm this does not create a second, independent `GetRecentWorkspaces` polling path that could desync from the sidebar's existing one — it should read from the same `workspaceStore` state.

### Phase 5: verify

- [x] `go build ./...` and `npm run build` (frontend) both pass.
- [x] `wails dev` on Linux:
  - fourth icon appears, opens the panel
  - chart renders with this machine's real `~/.claude` data, correct-looking totals for at least one known day
  - day/week/month toggle changes the grouping without errors
  - recent projects list appears below the chart, in that order, and clicking a project opens it (same as from the existing list)
  - temporarily point `os.UserHomeDir()`-derived path at a non-existent directory (or test on a fresh path) to confirm the empty-state path doesn't crash — or reason through the code path carefully if a live test isn't practical
  - time the panel's first load against the real ~89MB dataset; confirm no multi-second UI freeze (should be async/non-blocking regardless of scan duration)
- [ ] Windows/macOS: not verified from here; report as such.

### Phase 6: docs and finish

- [x] Confirm `usage.md`, `shell.md`, `desktop-window.md`, `architecture/overview.md` match what shipped (they were pre-written for this planned shape in `bsdd new`; fix any drift).
- [x] `docs/frontend.md`: add the new panel's pattern (4th `Panel` value, where its recent-projects section lives).
- [x] If a chart library was added despite the phase-3 default, update `project-dna.md`'s Technology Stack table and write a short ADR.
- [x] `bsdd finish`. Ask before `bsdd sync`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Very large individual `.jsonl` lines (multi-MB `thinking`/tool output) | Slow or memory-heavy parsing | `bufio.Scanner` with a large explicit buffer; cheap substring pre-check before full unmarshal |
| Corrupt/partial last line (crash mid-write) | Scan aborts | Skip lines that fail to unmarshal, keep going |
| No `~/.claude` on some machines (or a differently-versioned Claude Code that changes the JSONL shape) | Wrong counts or a crash | Empty-state for missing directory; tolerate unknown/extra fields by only decoding the fields needed; log and skip on shape mismatch per line rather than failing the whole call |
| Duplicating `WorkspaceList`'s data path | Recent-projects lists drift out of sync between panels | Reuse the same store/component, not a parallel fetch |
| Hand-rolled chart scope creep | Time sink reinventing a chart library | Keep the first version to one metric + a legend; treat anything fancier as a follow-up |

## Definition of Done

Per `.specs/tasks/sidebar-usage-panel.md`.
