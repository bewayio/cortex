---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-25
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

# Task: Usage sidebar panel (Claude Code token usage + recent projects)

## Status

done (2026-09-26, corrected) — see "Correction (2026-09-26)" below. The title kept the word "sidebar" from the original request; the shipped feature is an editor tab, not a sidebar panel.

## Goal

A fourth icon in the activity bar opens a panel showing, top to bottom: a Claude Code token-usage chart (grouped by day, week or month, switchable, all in one chart) and, below it, the recent-projects list.

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Module specs: `.specs/modules/usage.md` (new), `.specs/modules/shell.md`, `.specs/modules/workspace.md`
- Area: `.specs/areas/desktop-window.md`
- ADRs: none directly; no new one written for this task (see Implementation Notes on the charting approach)

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries are known (new `usage` module, frontend touches `shell`)
- [x] Related ADRs reviewed (none apply)
- [x] Security implications identified (read-only over `~/.claude`, no network, no writes)

## Decisions Already Made (2026-09-25, with the user)

1. **Recent projects** = the existing recent-workspaces data (same source as today's `WorkspaceList`/`GetRecentWorkspaces`), not a new list derived from `~/.claude/projects`. No new backend method for this part.
2. **Codex is out of scope.** No `~/.codex` directory was found to confirm its log format. Only `claude` is read. Codex is `planned`, not implemented — do not guess at its format.
3. **No money amounts.** Only token counts (input, output, cache creation, cache read) are shown. No price table, no currency, to avoid shipping a number that goes stale as pricing changes.
4. **Layout**: this panel does not use the shared "WorkspaceList always on top of every panel" slot. It renders its own body: chart first, then a recent-projects list (reusing the `WorkspaceList` component/data, not duplicating its backend calls).

## Acceptance Criteria

1. A fourth `ActivityBar` button (icon distinct from Explorer/Git/Terminal-toggle, for example a bar-chart icon) opens a new panel.
2. The panel's body shows, in order: (a) the token usage chart, (b) the recent-projects list.
3. The chart shows Claude Code token usage (input, output, cache creation, cache read — or a sensible combined view) as one chart with a control to switch grouping between day, week and month, without changing chart type or losing the current time range.
4. Data comes from parsing every `~/.claude/projects/**/*.jsonl` file's `assistant`-type lines' `message.usage` fields, bucketed by the line's `timestamp`. Verified against this machine's real data before considering the task done.
5. If `~/.claude` or `~/.claude/projects` does not exist (Claude Code never used, or a different machine), the panel shows an empty/zero state, not an error and not a crash.
6. Reading and aggregating the logs does not freeze the UI — runs as an async bound method call with a loading state in the panel, tested against this machine's real data volume (89 MB across 9 projects as of 2026-09-25) without a multi-second freeze.
7. The recent-projects list in this panel behaves like the existing one (opens the workspace on click), without duplicating the `GetRecentWorkspaces` call pattern in a way that could desync from the sidebar's existing list — reuse the component/store, don't fork it.
8. No token or usage data is written anywhere by BCode; this module is read-only.

## Implementation Notes

- **Backend**: new `usage.go`-style section in `app.go` (or a new file if the module split from `initial-setup.md` roadmap item 4 happens first): `GetClaudeTokenUsage() ([]DailyUsage, error)`. Walk `~/.claude/projects/*/*.jsonl` (`os.UserHomeDir()` + `.claude/projects`), read line by line (don't load whole files into memory at once for the larger ones — `bufio.Scanner` with a large enough buffer, since some lines carry big `thinking`/tool-output blocks), parse only enough JSON to reach `type`, `timestamp`, `message.usage`; skip non-`assistant` lines cheaply before full unmarshal if possible. Aggregate into a map keyed by calendar day (`YYYY-MM-DD`, local time or UTC — decide and document; UTC is simpler and avoids DST edge cases, recommended). Return a sorted slice.
- Frontend groups day-buckets into week/month client-side for the toggle — no need for the backend to pre-aggregate multiple granularities.
- **Charting**: no chart library exists in `frontend/package.json` today. Recommended default: a small hand-rolled SVG/CSS bar chart component (the codebase already hand-rolls its commit graph in `CommitGraph.tsx` — same spirit, keeps the dependency footprint unchanged, matches `project-dna.md`'s "Technology Stack" table without needing a sync update). If the implementer instead wants a charting library (e.g. `recharts`), that is a `project-dna.md` "Technology Stack" change and its own small ADR — do not add a dependency silently.
- Before writing any chart code or picking colors, load the `dataviz` skill (if available in the executing session) for the palette/accessibility guidance, even though this is a native app UI and not an Artifact — the skill's guidance is medium-agnostic per its own description.
- New `Panel` type value across `App.tsx`, `ActivityBar.tsx`, `Sidebar.tsx`: extend `'explorer' | 'git'` to add `'usage'` (or a similarly clear name — confirm it does not collide with anything before the frontend `chat` module's old naming).
- New frontend files: `components/UsagePanel.tsx` (chart + grouping toggle + recent-projects section), and whatever small chart sub-component it needs.
- Binding: after adding the Go method, run `wails generate module` before touching the frontend, same as prior tasks in this project's history.
- Do not touch `frontend/wailsjs` by hand. Do not add Codex parsing code. Do not add a price table.

- Plan: `docs/plans/2026-09-25_sidebar-usage-panel.md`. Next command: `bsdd start`.

## Definition Of Done

- [x] Acceptance criteria met, verified against this machine's real `~/.claude/projects` data (16 days, 0.33s scan)
- [x] `usage.md`, `shell.md`, `desktop-window.md`, `architecture/overview.md` reflect the shipped shape
- [x] No charting library added (hand-rolled chart, per the recommended default) — `project-dna.md` Technology Stack unchanged, correctly
- [x] Correction (2026-09-26) applied and re-verified (see below)
- [ ] Sync Review completed if source docs changed (pending `bsdd sync`)

## Correction (2026-09-26)

The user rejected the sidebar-panel delivery: "os graficos e ultimos projetos era para abrir na area de arquivos... quero que isso abra como uma nova aba, no estilo do welcome do vscode." The original acceptance criteria above (1–2, "a fourth ActivityBar button... opens a new panel") described exactly what was built, but not what the user actually wanted — a misread of "panel" as sidebar panel instead of editor tab.

Reworked to an editor tab, following the codebase's existing singleton-tab pattern (`isGraphTab`, git graph):

- `EditorTab` (`types.ts`) gets `isUsageTab?: boolean`.
- `editorStore.openOrFocusTab` treats `isUsageTab` like `isGraphTab`: one instance, fixed id (`'usage-tab'`).
- `ActivityBar`'s usage button no longer calls `onPanelChange` — it calls `openOrFocusTab({ isUsageTab: true, ... })` directly (via `useEditorStore`), and shows active state from `getActiveTab()?.isUsageTab`, not from `activePanel`.
- `EditorPane` renders `<UsageTab />` when `activeTab.isUsageTab`, same branch style as `isGraphTab`/`isCommitTab`. It now takes an `onOpenWorkspace` prop, threaded from `App.tsx` (previously only `Sidebar` received it).
- `EditorTabBar` gets a `BarChart2` tab icon and excludes usage tabs from the mode-button row and from the `path`-as-tooltip default.
- `components/UsagePanel.tsx` (sidebar version) **deleted**. `components/UsageTab.tsx` created: same data/logic (chart, grouping, fixed-height detail box), restyled as a centered, card-based full-page tab (max-width ~640px, like a VS Code Welcome tab) instead of a 240px-wide sidebar body.
- `Sidebar.tsx`, `App.tsx`, `ActivityBar.tsx`: `Panel` reverted to `'explorer' | 'git'`. The `onPanelChange` prop and the "switch to Explorer after opening a recent project" workaround added for the sidebar version are gone — opening a workspace from the tab's recent-projects list is now a normal action with no panel to switch.
- Re-verified: `go build`, `npm run build`, `wails build` all pass. Rendered both idle and hover states via a static preview (real proportions, real sample data) to confirm no overlap or clipping in the wider layout — same discipline as the sidebar version's own render-and-look pass.
- Not re-litigated: recent-projects data source (still the existing `WorkspaceList`/store), Codex scope, no money amounts, no new chart dependency — none of that changed with this correction.
