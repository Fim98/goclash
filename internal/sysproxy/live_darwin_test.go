//go:build darwin

package sysproxy

import (
	"context"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
)

// TestLiveSystemProxyRoundTrip edits this machine's real proxy settings, so it
// only runs on explicit request:
//
//	GOCLASH_LIVE_SYSPROXY=1 go test ./internal/sysproxy -run Live -v
//
// It snapshots the active network service, enables the proxy on the port the
// machine already uses (so connectivity is never pointed at a dead port),
// reads the values back with networksetup, disables them, then restores the
// original state — bypass list included.
func TestLiveSystemProxyRoundTrip(t *testing.T) {
	if os.Getenv("GOCLASH_LIVE_SYSPROXY") != "1" {
		t.Skip("set GOCLASH_LIVE_SYSPROXY=1 to edit this machine's proxy settings")
	}

	ctx := context.Background()
	manager := New()
	service, err := darwinPrimaryService(ctx, manager)
	if err != nil {
		t.Fatalf("检测网络服务：%v", err)
	}
	t.Logf("网络服务 = %q", service)

	before := snapshot(t, service)
	t.Cleanup(func() { restore(t, service, before) })

	port := before.Web.Port
	if port == 0 {
		// Nothing configured yet: fall back to the app default.
		port = 7890
	}
	t.Logf("测试端口 = %d（沿用当前系统代理端口，避免指向未监听端口）", port)

	if err := manager.Enable(ctx, port); err != nil {
		t.Fatalf("Enable: %v", err)
	}

	after := snapshot(t, service)
	for name, got := range map[string]proxySetting{
		"web": after.Web, "secure": after.Secure, "socks": after.Socks,
	} {
		if !got.Enabled || got.Server != "127.0.0.1" || got.Port != port {
			t.Fatalf("%s = %+v, want 127.0.0.1:%d enabled", name, got, port)
		}
	}
	for _, want := range bypassHosts {
		if !contains(after.Bypass, want) {
			t.Fatalf("绕过列表缺少 %q：%v", want, after.Bypass)
		}
	}
	t.Logf("启用后绕过列表 = %v", after.Bypass)
	t.Logf("scutil --proxy:\n%s", run(t, "scutil", "--proxy"))

	if err := manager.Disable(ctx); err != nil {
		t.Fatalf("Disable: %v", err)
	}
	disabled := snapshot(t, service)
	for name, got := range map[string]proxySetting{
		"web": disabled.Web, "secure": disabled.Secure, "socks": disabled.Socks,
	} {
		if got.Enabled {
			t.Fatalf("%s still enabled after Disable: %+v", name, got)
		}
	}
	t.Log("关闭后三项均为 off")
}

type proxySetting struct {
	Enabled bool
	Server  string
	Port    int
}

type serviceState struct {
	Web    proxySetting
	Secure proxySetting
	Socks  proxySetting
	Bypass []string
}

func snapshot(t *testing.T, service string) serviceState {
	t.Helper()
	state := serviceState{
		Web:    readProxy(t, service, "webproxy"),
		Secure: readProxy(t, service, "securewebproxy"),
		Socks:  readProxy(t, service, "socksfirewallproxy"),
		Bypass: readBypass(t, service),
	}
	t.Logf("快照：web=%+v secure=%+v socks=%+v bypass=%v",
		state.Web, state.Secure, state.Socks, state.Bypass)
	return state
}

func readProxy(t *testing.T, service, kind string) proxySetting {
	t.Helper()
	out := run(t, "networksetup", "-get"+kind, service)
	setting := proxySetting{}
	for _, line := range strings.Split(out, "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), ":")
		if !found {
			continue
		}
		value = strings.TrimSpace(value)
		switch key {
		case "Enabled":
			setting.Enabled = value == "Yes"
		case "Server":
			setting.Server = value
		case "Port":
			setting.Port, _ = strconv.Atoi(value)
		}
	}
	return setting
}

func readBypass(t *testing.T, service string) []string {
	t.Helper()
	out := run(t, "networksetup", "-getproxybypassdomains", service)
	if strings.Contains(out, "aren't any") {
		return nil
	}
	hosts := make([]string, 0, 8)
	for _, line := range strings.Split(out, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			hosts = append(hosts, line)
		}
	}
	return hosts
}

// restore puts the machine back exactly as it was found.
func restore(t *testing.T, service string, state serviceState) {
	t.Helper()
	apply := func(kind string, setting proxySetting) {
		if setting.Enabled {
			run(t, "networksetup", "-set"+kind, service, setting.Server, strconv.Itoa(setting.Port))
			return
		}
		run(t, "networksetup", "-set"+kind+"state", service, "off")
	}
	apply("webproxy", state.Web)
	apply("securewebproxy", state.Secure)
	apply("socksfirewallproxy", state.Socks)
	if len(state.Bypass) > 0 {
		run(t, "networksetup", append([]string{"-setproxybypassdomains", service}, state.Bypass...)...)
	}

	restored := snapshot(t, service)
	if restored.Web != state.Web || restored.Secure != state.Secure || restored.Socks != state.Socks {
		t.Errorf("恢复失败：want %+v got %+v", state, restored)
	}
	for _, want := range state.Bypass {
		if !contains(restored.Bypass, want) {
			t.Errorf("绕过列表未恢复 %q：%v", want, restored.Bypass)
		}
	}
	t.Log("已恢复到测试前状态")
}

func run(t *testing.T, name string, args ...string) string {
	t.Helper()
	out, err := exec.Command(name, args...).CombinedOutput()
	if err != nil {
		t.Fatalf("%s %s: %v（%s）", name, strings.Join(args, " "), err, out)
	}
	return string(out)
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
