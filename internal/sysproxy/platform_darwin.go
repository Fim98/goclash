//go:build darwin

package sysproxy

import (
	"context"
	"fmt"
	"strings"
)

func platformEnable(ctx context.Context, m *Manager, port int) error {
	service, err := darwinPrimaryService(ctx, m)
	if err != nil {
		return err
	}
	// Merge rather than replace: the machine may already carry hand-written
	// exceptions that have nothing to do with this app.
	existing := []string{}
	if out, err := m.run(ctx, "networksetup", "-getproxybypassdomains", service); err == nil {
		existing = parseBypass(string(out))
	}
	for _, s := range darwinEnableSteps(service, port, mergeBypass(existing)) {
		if err := m.runStep(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

func platformDisable(ctx context.Context, m *Manager) error {
	service, err := darwinPrimaryService(ctx, m)
	if err != nil {
		return err
	}
	for _, s := range darwinDisableSteps(service) {
		if err := m.runStep(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

// darwinPrimaryService resolves the network service that carries the default
// route. `networksetup` only accepts service names, not interface names.
func darwinPrimaryService(ctx context.Context, m *Manager) (string, error) {
	device := ""
	if out, err := m.run(ctx, "route", "-n", "get", "default"); err == nil {
		device = parseDefaultInterface(string(out))
	}

	out, err := m.run(ctx, "networksetup", "-listnetworkserviceorder")
	if err != nil {
		return "", fmt.Errorf("读取网络服务列表失败：%w（%s）", err, strings.TrimSpace(string(out)))
	}
	service, ok := pickService(parseServiceOrder(string(out)), device)
	if !ok {
		return "", fmt.Errorf("没有找到可用的网络服务，无法设置系统代理")
	}
	return service.name, nil
}
