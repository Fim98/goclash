package main

import (
	_ "embed"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// The menu bar icon is a template image: black with alpha, so macOS recolours
// it for light and dark menu bars. It is drawn as a square frame to match the
// 4px-border language of the app.
//
//go:embed build/trayicon.png
var trayIcon []byte

// setupTray creates the popup window from board 03 (420×620) and the menu bar
// item that owns it. Clicking the icon toggles the popup; Wails positions it
// under the icon and hides it again when it loses focus, so no manual window
// management is needed here.
func setupTray(app *application.App, mainWindow *application.WebviewWindow) *application.WebviewWindow {
	trayWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "tray",
		Title:            "GoClash",
		Width:            420,
		Height:           620,
		Hidden:           true,
		Frameless:        true,
		AlwaysOnTop:      true,
		DisableResize:    true,
		BackgroundColour: application.NewRGB(255, 255, 255),
		URL:              "/?window=tray",
	})

	tray := app.SystemTray.New()
	tray.SetTemplateIcon(trayIcon)
	tray.SetTooltip("GoClash")
	tray.AttachWindow(trayWindow)
	tray.WindowOffset(6)

	menu := app.NewMenu()
	menu.Add("打开主界面").OnClick(func(*application.Context) {
		showMain(trayWindow, mainWindow)
	})
	menu.AddSeparator()
	menu.Add("退出 GoClash").OnClick(func(*application.Context) {
		app.Quit()
	})
	tray.SetMenu(menu)

	// The popup is frameless, so its own controls ask the host to close it or
	// raise the main window instead of touching window APIs from JS.
	app.Event.On("tray:hide", func(*application.CustomEvent) {
		trayWindow.Hide()
	})
	app.Event.On("tray:open-main", func(*application.CustomEvent) {
		showMain(trayWindow, mainWindow)
	})

	return trayWindow
}

func showMain(trayWindow *application.WebviewWindow, mainWindow *application.WebviewWindow) {
	trayWindow.Hide()
	mainWindow.Show()
	mainWindow.Focus()
}
