---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: [0005]
  sync_triggers:
    - Changes to public interface
    - New or removed events
    - Changes to dependencies
---

# Module: git

## Purpose

Show repository status, history, graph and diffs for the active workspace.

## Boundaries

- Owns: nothing persisted
- Does NOT own: file mutation, commits (read-only module)

## Public Interface

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| GitStatus | root | GitFileStatus[] | Porcelain status parsed |
| GitLog / GitGraphLog | root, limit | commits | History and graph data |
| GitCurrentBranch | root | string | Branch name |
| GitDiff / GitOriginalContent | root, path | string | Working tree diff, HEAD content |
| GitCommitMeta / GitCommitFileDiffs | root, hash | meta, FileDiff[] | Commit detail |

## Events Published

None.

## Events Consumed

None.

## Dependencies

| Dependency | Type | Interface |
|-----------|------|-----------|
| git executable | external process | `runGit(dir, args...)` |

## Areas

| Area | Permission Level |
|------|-----------------|
| desktop-window | local |

## Security

- Arguments come from the app, not free text. Paths and hashes should be passed after `--` where applicable (needs verification).

## Notes

- Frontend: `GitPanel`, `CommitGraph`, `CommitGraphTab`, `CommitDiffView`, `DiffViewer`, `gitStore`.
- Requires `git` in PATH.
