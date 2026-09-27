# ADR-0008: No custom Ctrl+V handling — let xterm's default byte reach the CLI

## Status

Accepted, final. Third and last revision, 2026-09-25. No BCode code is needed for this feature at all; the earlier custom implementations (two different ones, both removed) were solving a problem that didn't exist in BCode.

## Date

2026-09-22 (original decision), revised 2026-09-24 (twice), resolved 2026-09-25

## Context

The user wants to paste an image that only exists in the OS clipboard (never saved to disk) into the integrated terminal, so `claude` or `codex` running inside it can use it.

### Attempt 1 (2026-09-22): explicit `0x16` passthrough

BCode intercepted Ctrl+V in the frontend and explicitly sent the raw control byte `0x16` (SYN) to the PTY. **Result: appeared to fail** when first tested — but see Attempt 3, this was actually the right byte; the test just didn't have a clipboard tool installed, which looked like a code problem.

### Attempt 2 (2026-09-24): browser paste-event + temp file, all OS

Assuming attempt 1's mechanism was wrong (not just missing a system dependency), BCode was rewritten to read the image directly from the DOM `paste` event (`clipboardData.items`/`.files`), write it to a temp file via a new backend method (`SaveClipboardImageData`), and type the resulting path. This also removed the Linux-only `wl-paste`/`xclip` shell-out from an intermediate design. **Result: failed just as hard, differently.** Diagnostic logging (a `paste` listener on `window` and `document`) never fired at all, for text or image paste, meaning WebKitGTK in this app was not dispatching a DOM `paste` event for this input path the way assumed — this entire approach was chasing an event that doesn't fire here.

### Attempt 3 (2026-09-25): read the actual signal — the CLI's own message

With all custom Ctrl+V/paste handling removed, plain Ctrl+V still reached `claude`, which printed its own message: **"No image found in clipboard. Use ctrl+v to paste images."** This is decisive evidence, read together with `xterm.js`'s own default keyboard mapping (`common/input/Keyboard.ts`): for any `Ctrl+<letter>` combination that BCode's custom key handler does not intercept, xterm's built-in `evaluateKeyboardEvent` already computes `String.fromCharCode(keyCode - 64)` — for `V` (keyCode 86) that is `\x16`, the exact SYN byte Attempt 1 was sending manually. **`claude` (and presumably `codex`) already implement their own Ctrl+V clipboard-image handling, by reading the OS clipboard themselves** (most likely by shelling out to `wl-paste`/`xclip` on Linux, `pbpaste` on macOS, `Get-Clipboard` on Windows — consistent with how such CLIs are documented to behave in native terminals). Their attempt failed only because **neither `wl-paste` nor `xclip` was installed on the test machine**, which is a missing system package, not a BCode bug.

**Confirmed 2026-09-25**: after the user installed `wl-clipboard` on their Wayland session, Ctrl+V correctly pasted a clipboard image into `claude` running in a BCode terminal tab — no BCode code involved, nothing changed on BCode's side between the failed and successful attempt except the system having a clipboard tool. This validates the full chain end to end. `codex` was not separately tested.

## Decision

Do nothing in BCode for this feature. Do not intercept Ctrl+V. Do not add a `paste` DOM listener. Do not shell out to any clipboard tool. Do not add a backend method. `xterm.js`'s default key handling, unmodified, already delivers the byte the CLI needs.

The only actionable requirement is external to BCode: **the user's Linux system needs a clipboard tool that `claude`/`codex` can shell out to** — `wl-clipboard` (provides `wl-paste`) on a Wayland session, or `xclip` (or `xsel`) on an X11 session. Check with `echo $XDG_SESSION_TYPE`. macOS (`pbpaste`, built in) and Windows (PowerShell `Get-Clipboard`, built in) need no extra install, which also explains why the user's belief that "macOS probably works" was reasonable.

This closes ADR-0008. If a real BCode-side gap is found later (for example, a CLI that expects a different mechanism entirely, such as an escape-sequence-based image transfer like the Kitty graphics protocol), that would need a new ADR — this one's scope (getting the existing raw-byte convention through) is resolved.

## Consequences

### Positive

- Zero code, zero maintenance, zero new attack surface (no image bytes ever touched by BCode)
- Matches exactly how a native terminal behaves — nothing BCode-specific to keep in sync
- Two rounds of custom code (and their bugs — a `NotAllowedError` regression breaking plain-text paste, and a paste-event listener that silently never fired) are gone

### Negative

- Image paste in BCode's terminal only works if the user has installed the same clipboard tool a native terminal on their OS would need — BCode cannot install this for them, and cannot detect it's missing without trying (the CLI's own error message is the only feedback)
- If `codex` uses a different mechanism than `claude` for clipboard images, that is unverified
- Bundling the clipboard tools to remove this manual step was investigated and rejected — see Alternatives Considered — so this remains a permanent, documented user-facing requirement, not a temporary gap

### Neutral

- `terminal.md`'s only remaining note for this topic is that Ctrl+V is intentionally left to xterm's default handling — a future contributor should not "fix" this into a custom handler again without first checking whether a clipboard tool is installed

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Explicit `0x16` send (Attempt 1) | Same end result | Redundant — xterm already does this by default; the custom code added nothing and obscured the real (environment) cause of failure | Removed, redundant |
| Browser paste-event + temp file, all OS (Attempt 2) | Would not depend on `wl-paste`/`xclip` if it worked | The DOM `paste` event does not fire for this input path in this WebKitGTK build — confirmed empirically with a `window`/`document`-level diagnostic listener that never logged | Removed, does not work in this environment |
| Vendor `wl-paste`/`xclip` binaries in BCode, inject them onto the spawned shell's `PATH` as a fallback so `claude`/`codex` find them without the user installing anything | Confirmed technically feasible in a spike: both tools' official Ubuntu builds depend only on libraries already required by any Linux desktop capable of running BCode (`libwayland-client`, `libX11`/`libXmu`/`libXt`/`libSM`/`libICE`, `libffi`, all near-universal); `apt-get download` + `dpkg-deb -x` extracts working binaries with no root or build toolchain needed | **`xclip` is GPLv2, `wl-clipboard` is GPLv3.** Running them as separate subprocesses (never linked into BCode's own code) does not put BCode under GPL — this is "mere aggregation," explicitly permitted by the GPL itself — but *distributing* their binaries requires shipping each project's license text and making its corresponding source available (or a written offer to provide it) for as long as BCode is distributed. Also, a binary built against one distro's library versions is not guaranteed to run on every target distro. | **Rejected by the user 2026-09-25**, specifically over the GPL distribution obligation, not the technical feasibility |
| Do nothing, rely on xterm defaults + CLI's own clipboard reading; document the system requirement | Zero code, zero new licensing obligation, matches native terminal behavior exactly, and **confirmed working** once the tool is installed | Depends on an external system package the user must install themselves; BCode has no in-app prompt for this (not requested) | **Adopted, final** |

## References

- `frontend/node_modules/@xterm/xterm/src/common/input/Keyboard.ts` (default `Ctrl+<letter>` → C0 control code mapping)
- `frontend/node_modules/@xterm/xterm/src/browser/Clipboard.ts` (`handlePasteEvent`, text-only, unrelated to this final resolution)
- `.specs/modules/terminal.md`
- Task: `.specs/tasks/terminal-image-paste.md`
