package main

import (
	"context"
	"runtime"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// useFramelessWindow reports whether the OS title bar must be removed.
// macOS keeps the native hidden-inset title bar with traffic lights.
// Linux and Windows draw the shared title bar from the frontend (ADR-0007).
func useFramelessWindow() bool {
	switch runtime.GOOS {
	case "darwin":
		return false
	case "linux", "windows":
		return true
	default:
		return false
	}
}

// maximiseOnStartup maximises the main window at launch.
// On Linux a frameless GTK/WebKitGTK window that is maximised immediately on
// realize can end up showing only BackgroundColour: the webview widget does
// not get reallocated until something forces a redraw. A short delay lets the
// window finish realizing before it is maximised, which avoids the blank
// screen (ADR-0007 follow-up). macOS and Windows are not frameless-related
// here and keep the previous immediate behavior.
func maximiseOnStartup(ctx context.Context) {
	if runtime.GOOS == "linux" {
		go func() {
			time.Sleep(150 * time.Millisecond)
			wruntime.WindowMaximise(ctx)
		}()
		return
	}
	wruntime.WindowMaximise(ctx)
}
