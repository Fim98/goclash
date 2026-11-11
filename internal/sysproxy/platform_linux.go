//go:build linux

package sysproxy

import (
	"context"
	"fmt"
)

func platformEnable(ctx context.Context, m *Manager, port int) error {
	for _, s := range linuxEnableSteps(port) {
		if err := m.runStep(ctx, s); err != nil {
			return fmt.Errorf("%w（桌面代理依赖 gsettings，非 GNOME 桌面需要手动配置）", err)
		}
	}
	return nil
}

func platformDisable(ctx context.Context, m *Manager) error {
	for _, s := range linuxDisableSteps() {
		if err := m.runStep(ctx, s); err != nil {
			return err
		}
	}
	return nil
}
