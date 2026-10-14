package main

import (
	"embed"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

// Linux's window icon (taskbar/alt-tab/minimized) is NOT derived from
// build/appicon.png at runtime — wails build only uses that file to generate
// package-time assets (the AppImage icon, macOS .icns, Windows .ico). The
// running GTK window itself needs options.App.Linux.Icon set explicitly
// (gtk_window_set_icon under the hood), or GTK falls back to a generic
// desktop-environment icon (looked like a gear) — bug reported by the user
// right after the Cortex rebrand, 2026-10-13.
//
//go:embed build/appicon.png
var icon []byte

// Version is set at build time via -ldflags "-X main.Version=...";
// the release workflow passes the same version it tags the GitHub
// Release with. Left as "dev" for local `wails build`/`wails dev`.
var Version = "dev"

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Println("cortex " + Version)
		return
	}

	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "Cortex",
		Width:     1280,
		Height:    800,
		MinWidth:  800,
		MinHeight: 500,
		Frameless: useFramelessWindow(),
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 30, G: 30, B: 30, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		OnBeforeClose:    app.beforeClose,
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.NSAppearanceNameDarkAqua,
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
		Linux: &linux.Options{
			Icon: icon,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
