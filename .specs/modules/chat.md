---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: [0002, 0003]
  sync_triggers:
    - Changes to public interface
    - New or removed events
    - Changes to dependencies
---

# Module: chat

## Purpose

Talk to Claude with streamed answers, attachments and saved history per workspace tab.

## Boundaries

- Owns: `~/.bcode/chats/{ws}/{tab}.json`, in-flight stream cancel functions
- Does NOT own: workspace state, file content

## Public Interface

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| StartChatStream | sessionID, apiKey, messages, attachments, systemPrompt, model | error | Uses `claude` CLI if found, else Anthropic SDK |
| StopChatStream | sessionID | none | Cancel |
| Save / Load / Delete ChatMessages, ListChatTabs | wsID, tabID | data | History persistence |

## Events Published

| Event | Payload | When |
|-------|---------|------|
| chat:token:{id} | text chunk | Streaming |
| chat:done:{id} | none | Finished |
| chat:error:{id} | message | Failure |

## Events Consumed

None.

## Dependencies

| Dependency | Type | Interface |
|-----------|------|-----------|
| claude CLI | external process | stream-json over stdin/stdout |
| anthropic-sdk-go | library | fallback when CLI is missing |

## Areas

| Area | Permission Level |
|------|-----------------|
| desktop-window | local, needs CLI login or API key |

## Security

- API key from env or argument. Must not be logged or written to disk by the backend.
- Attachments are base64 and may be large.

## Notes

- Planned: the terminal panel stops offering the Claude chat tab, so this module loses its only entry point. Code and `~/.bcode/chats` stay for now. Removing the module is a separate decision and would supersede ADR-0003. Task: `.specs/tasks/terminal-plain-only.md`.

- Frontend: `ClaudeChatPanel.tsx`.
- Contains test helpers `TestImageStream` and `TestClaudeChat` bound to the frontend (candidates for removal).
- Gap: `findClaudeCLI` has only Unix paths.
