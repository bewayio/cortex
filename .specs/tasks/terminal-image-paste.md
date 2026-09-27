---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-22
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: [0004, 0008]
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: Terminal accepts pasting an in-memory image

## Status

done (2026-09-25) — confirmed working on Linux after the user installed `wl-clipboard`. `codex` not separately verified; bundling the clipboard tool to remove the manual install step was investigated and rejected (GPL distribution obligations for `xclip`/`wl-clipboard` — see ADR-0008 Alternatives Considered).

## Goal

Pasting an image that is only in the OS clipboard (never saved to disk) into the integrated terminal works with **no BCode code at all**: xterm's default key handling already sends Ctrl+V as the raw byte `0x16`, which `claude`/`codex` read themselves via their own OS clipboard access. The only requirement is a clipboard tool installed on the user's system (ADR-0008, resolved 2026-09-25, after two different custom implementations were tried and removed).

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Module spec: `.specs/modules/terminal.md`
- ADR: `.specs/adrs/0008-terminal-raw-paste-passthrough.md` (accepted, verification pending)

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries are known (terminal frontend only)
- [x] Related ADRs reviewed
- [x] Security implications identified (none beyond existing "runs arbitrary commands" note)

## Acceptance Criteria

1. With a clipboard tool installed (`wl-clipboard` on Wayland, `xclip`/`xsel` on X11, nothing extra needed on macOS/Windows), copy a screenshot to the clipboard (never saved to a file) and press Ctrl+V while `claude` is running in a BCode terminal tab. `claude` reads the image — confirmed by the CLI's own behavior, not a BCode-specific message. **Verified 2026-09-25 on Linux with `wl-clipboard` installed.**
2. Same check for `codex` — **not verified**, left as a follow-up if the user tries it.
3. Without a clipboard tool installed, `claude` shows its own "No image found in clipboard" message (confirmed 2026-09-25) — this is expected and out of BCode's control; the task's job is only to make sure the raw byte reaches the CLI unmodified, which it does by not touching Ctrl+V at all.
4. Plain text paste (Ctrl+V, right-click, middle-click) works exactly as it did before any of this work started — verified 2026-09-25, since the final state adds no code that could regress it.
5. `terminal.md` carries a clear note that this is intentionally hands-off, so nobody re-adds custom Ctrl+V handling without first checking whether the real cause of a future report is a missing system package.

## Implementation Notes (final, 2026-09-25)

- No code in this repository implements this feature. `frontend/src/components/Terminal.tsx`'s `attachCustomKeyEventHandler` does not have a Ctrl+V branch; Ctrl+V simply returns `true` (unhandled) like any other key BCode doesn't special-case, and xterm.js's own default keyboard mapping sends `\x16` for it.
- Two earlier implementations were built and fully removed during this task: an explicit `0x16` sender (redundant with xterm's default), and a `paste`-DOM-event-based temp-file writer with its own backend method `SaveClipboardImageData` (removed from `app.go`, `frontend/src/components/Terminal.tsx` and `frontend/src/main.tsx`, including two temporary diagnostic `paste` listeners on `window`/`document` used to confirm the event never fired). Neither exists in the current code.
- The only real fix was diagnostic: confirming the CLI's own "No image found in clipboard" message meant the byte was arriving correctly and the gap was a missing system package (`wl-clipboard`/`xclip`), not something BCode's code could address.
- Verified 2026-09-25: `claude` receiving Ctrl+V and responding with its own clipboard-read attempt (proving the byte arrives), then a successful paste after the user installed `wl-clipboard`. **Not yet verified**: the same check against `codex`.
- Bundling `wl-paste`/`xclip` inside BCode (so the user would never need to install anything) was spiked and found technically workable — `apt-get download` + `dpkg-deb -x` produces working binaries whose only dependencies are libraries any Linux desktop already has — but rejected: `xclip` is GPLv2 and `wl-clipboard` is GPLv3, and distributing their binaries would obligate BCode to ship each project's license text and make its source available. The user chose to keep this as a documented manual install step instead. See ADR-0008 for the full trade-off.

## Definition Of Done

- [x] Root cause found and confirmed (missing clipboard tool, not a BCode bug)
- [x] All exploratory code removed, builds clean (Go + frontend)
- [x] `terminal.md` updated with the final hands-off note
- [x] Acceptance criterion 1 verified for real on Linux
- [x] Bundling investigated and explicitly rejected (GPL), not left as an open question
- [ ] Acceptance criterion 2 (`codex`) — not verified, not blocking
- [ ] Sync Review completed if source docs changed
