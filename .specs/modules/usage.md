---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-09-25
version: 1
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: []
  sync_triggers:
    - Changes to public interface
    - New or removed events
    - Changes to dependencies
---

# Module: usage

## Purpose

Read local Claude Code CLI session logs and show token usage, grouped by day, week or month, in an editor tab (VS Code-"Welcome"-style, not a sidebar panel). Read-only observer, no data of its own.

## Boundaries

- Owns: nothing persisted. In-memory aggregation only, recomputed on each read.
- Does NOT own: `~/.claude/projects/*.jsonl` (owned and pruned by the `claude` CLI itself, outside BCode), workspace list (`workspace` module), chat history (`chat` module).

## Public Interface

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| GetClaudeTokenUsage | none | `DailyUsage[]` (`date`, `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `model` breakdown) | Scans every `~/.claude/projects/**/*.jsonl`, sums token fields from each `assistant` message's `usage` block, bucketed by calendar day (frontend groups further into week/month) |

## Events Published

None.

## Events Consumed

None.

## Dependencies

| Dependency | Type | Interface |
|-----------|------|-----------|
| `claude` CLI's own local session logs | filesystem, read-only | JSONL, one file per session under `~/.claude/projects/<cwd-slug>/<session-id>.jsonl` |

## Areas

| Area | Permission Level |
|------|-----------------|
| desktop-window | local, read-only over `~/.claude` |

## Security

- Read-only. Never writes to `~/.claude`.
- Session content (messages, code) is not read or transmitted — only the `usage` numeric fields and `timestamp`/`cwd` per line are extracted. Message bodies must not be parsed into memory beyond what is needed to reach `usage`.
- All processing is local; nothing is sent over the network.

## Notes

- Implemented 2026-09-25: `GetClaudeTokenUsage` (`app.go`) walks `~/.claude/projects/**/*.jsonl` with `bufio.Scanner` (16MB max line buffer — some lines carry large `thinking`/tool-output blocks), pre-filters lines by a cheap substring check before a full `json.Unmarshal`, and aggregates by UTC calendar day. Verified against this machine's real ~89MB/9-project dataset: 16 days, full scan in 0.33s (well under a perceptible freeze). Frontend groups days into ISO weeks or calendar months client-side and renders a single hand-rolled bar chart (accent color, one metric — total tokens — per bucket), no new npm dependency. A fixed-height detail box above the chart shows the hovered bucket's input/output/cache breakdown, or the all-time total when idle; a floating tooltip was tried first and rejected after a rendered preview showed it overlapping the chart.
- Corrected 2026-09-26: the first version put this content in a fourth sidebar panel. The user asked for it to open where files open instead — a tab in the main editor area, VS Code-"Welcome tab" style. Moved to `components/UsageTab.tsx`, opened via `ActivityBar`'s usage button calling `editorStore.openOrFocusTab({ isUsageTab: true, ... })`, same singleton-tab pattern as the existing git-graph tab (`isGraphTab`). `Panel` (`explorer`/`git`) and `Sidebar.tsx` are back to their pre-usage-panel shape — no sidebar changes remain from this feature. `EditorPane` and `App.tsx` now thread `onOpenWorkspace` down to the tab so its recent-projects list can still open a workspace: opening one is a normal editor-tab action, no special panel-switch workaround was needed once the content moved out of the sidebar.
- Format confirmed by direct inspection of a real `~/.claude/projects/*.jsonl` file on 2026-09-25 (not from documentation, since none was available): each `assistant`-type line has `message.usage` with `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `message.model`, and a top-level `timestamp` and `cwd`.
- `claude` itself prunes old session files (`~/.claude/.last-cleanup`); BCode does not need its own retention cap for the numbers to stay bounded, but should still tolerate a missing or very large `~/.claude` gracefully (no crash, no multi-second UI freeze — do the scan off the UI thread / as an async bound method, show a loading state).
- Money amounts are explicitly out of scope for the first version (user decision, 2026-09-25): showing a cost table per model risks going stale and was not wanted. Only token counts are shown.
- Codex CLI usage is explicitly out of scope for the first version (user decision, 2026-09-25): no `~/.codex` directory was available on the machine used to write this spec, so its log format is unverified. A future task must confirm the format on a machine that has it before adding Codex support here.
- Frontend: `components/UsageTab.tsx` (chart + grouping toggle) and reused `WorkspaceList.tsx` (recent projects), rendered as an editor tab per `modules/shell.md`. `UsagePanel.tsx` (the sidebar version) was deleted, not kept alongside.
- Shipped 2026-09-26: this is now the "Home" tab, first `ActivityBar` icon (`Home` icon from lucide-react). Internal identifiers (`isUsageTab`, the `UsageTab.tsx` filename, the `openUsageTab`-style function names) were kept as-is — only the user-visible label/position changed, to avoid unnecessary churn. Task: `.specs/tasks/home-icon-and-closed-projects.md`.
