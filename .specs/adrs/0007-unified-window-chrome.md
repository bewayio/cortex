# ADR-0007: Unified window chrome with a frameless window and one shared title bar

## Status

Accepted (user chose the frameless option during `bsdd plan` on 2026-09-21)

## Date

2026-09-21

## Context

`main.go` hides the title bar only on macOS (`mac.TitleBarHiddenInset`). The frontend always renders `app-titlebar`, a 44px strip with `padding-left: 80px` that reserves room for the macOS traffic lights.

On Linux and Windows the OS also draws its own title bar. The strip then shows as a second, empty black bar. On macOS the strip holds the traffic lights, so it reads as the title bar.

The user wants the same layout on Linux, Windows and macOS with no extra empty space at the top. Project restriction 2 keeps the macOS look as the visual reference. The user rejected the smaller option (strip on macOS only, native bar elsewhere) and asked for pixel identical chrome.

## Decision

We will draw one title bar in the frontend on all three systems and remove the native title bar where the OS would add one.

- macOS: keep `TitleBarHiddenInset`. The native traffic lights stay. The shared bar leaves 80px on the left for them and shows no window buttons.
- Linux and Windows: set `Frameless: true`. The shared bar draws minimize, maximize/restore and close on the right.
- Height, color, border and drag region are the same on all systems. Height comes from one CSS token.
- The bar is drag region through `--wails-draggable: drag`. Buttons are `no-drag`. Double click toggles maximize.
- Resize uses the Wails frameless edge resize, available on Linux and Windows.
- The platform is detected once through the Wails runtime `Environment()` and exposed as `data-platform` on the root element. Only the title bar component and the CSS read it.
- The frameless flag is chosen in one small function in the Go entry point, with explicit darwin, linux and windows branches (restriction 5).

## Consequences

### Positive

- Same chrome on all systems, no double bar
- The bar can later host title, workspace name or menu on all systems
- macOS look is unchanged

### Negative

- We own window buttons on Linux and Windows. Snap layouts on Windows 11 and some window manager gestures may not appear on the custom maximize button
- Frameless windows have no native shadow or border on some Linux desktops
- Wails frameless drag and resize have known rough edges on WebKitGTK and Wayland. Needs manual verification
- More frontend code to maintain

### Neutral

- Alt+F4 and OS keyboard shortcuts still work, they belong to the window manager

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Strip on macOS only, native title bar on Linux and Windows | Small change, native controls | Not pixel identical, native bar follows OS theme | User asked for identical chrome |
| Remove the strip everywhere, put traffic lights over the activity bar | One code path | Changes the macOS look and collides with the activity bar | Violates restriction 2 |
| Keep the strip on all systems next to the native bar | No branching | Second bar on Linux and Windows | Does not meet "no extra space" |

## References

- `main.go` (window options)
- `frontend/src/App.tsx`, `frontend/src/styles/components.css` (`app-titlebar`)
- Wails v2.12 frameless support: `pkg/options/options.go` (`Frameless`), runtime `--wails-draggable`
- `.specs/ui/design-direction.md`, `.specs/modules/shell.md`
- Task: `.specs/tasks/unified-window-chrome.md`
