package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

// main function serves as the application's entry point. It creates the main
// window and runs the application until the window is closed.
//
// The window geometry and background match the design canvas (1440×900, white,
// no outer chrome of our own): macOS draws the traffic lights inset, and the
// app chrome starts below them.
func main() {
	app := application.New(application.Options{
		Name:        "GoClash",
		Description: "A Clash Meta desktop client",
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "GoClash",
		Width:  1440,
		Height: 900,
		Mac: application.MacWindow{
			// Matches the 44px title bar in the design: the OS traffic lights sit
			// inside that strip and the rest of it is our drag region.
			InvisibleTitleBarHeight: 44,
			Backdrop:                application.MacBackdropNormal,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(255, 255, 255),
		URL:              "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
