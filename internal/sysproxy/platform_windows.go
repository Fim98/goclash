//go:build windows

package sysproxy

import (
	"context"
	"syscall"
)

func platformEnable(ctx context.Context, m *Manager, port int) error {
	for _, s := range windowsEnableSteps(port) {
		if err := m.runStep(ctx, s); err != nil {
			return err
		}
	}
	notifyWinINet()
	return nil
}

func platformDisable(ctx context.Context, m *Manager) error {
	for _, s := range windowsDisableSteps() {
		if err := m.runStep(ctx, s); err != nil {
			return err
		}
	}
	notifyWinINet()
	return nil
}

// notifyWinINet tells running browsers the registry changed; without it they
// keep the previous proxy until restart.
func notifyWinINet() {
	const (
		internetOptionRefresh         = 37
		internetOptionSettingsChanged = 39
	)
	setOption := syscall.NewLazyDLL("wininet.dll").NewProc("InternetSetOptionW")
	_, _, _ = setOption.Call(0, internetOptionSettingsChanged, 0, 0)
	_, _, _ = setOption.Call(0, internetOptionRefresh, 0, 0)
}
