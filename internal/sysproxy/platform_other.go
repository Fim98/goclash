//go:build !darwin && !linux && !windows

package sysproxy

import (
	"context"
	"runtime"
)

func platformEnable(context.Context, *Manager, int) error {
	return unsupported()
}

func platformDisable(context.Context, *Manager) error {
	return unsupported()
}

func unsupported() error {
	return &UnsupportedError{OS: runtime.GOOS}
}

// UnsupportedError keeps the caller honest on platforms without a system proxy
// integration instead of reporting a silent success.
type UnsupportedError struct{ OS string }

func (e *UnsupportedError) Error() string {
	return "当前系统不支持自动设置系统代理：" + e.OS
}
