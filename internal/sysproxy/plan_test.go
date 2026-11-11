package sysproxy

import (
	"context"
	"reflect"
	"strings"
	"testing"
)

const serviceOrder = `An asterisk (*) denotes that a network service is disabled.
(1) Wi-Fi
(Hardware Port: Wi-Fi, Device: en0)

(2) USB 10/100/1000 LAN
(Hardware Port: USB 10/100/1000 LAN, Device: en5)

(*) Thunderbolt Bridge
(Hardware Port: Thunderbolt Bridge, Device: bridge0)
`

func TestParseServiceOrder(t *testing.T) {
	services := parseServiceOrder(serviceOrder)
	want := []networkService{
		{name: "Wi-Fi", device: "en0", enabled: true},
		{name: "USB 10/100/1000 LAN", device: "en5", enabled: true},
		{name: "Thunderbolt Bridge", device: "bridge0", enabled: false},
	}
	if !reflect.DeepEqual(services, want) {
		t.Fatalf("services = %+v", services)
	}
}

func TestPickServicePrefersDefaultRoute(t *testing.T) {
	services := parseServiceOrder(serviceOrder)

	starlink, ok := pickService(services, "en5")
	if !ok || starlink.name != "USB 10/100/1000 LAN" {
		t.Fatalf("picked = %+v ok=%v", starlink, ok)
	}

	// Unknown device falls back to the first enabled service, never the
	// disabled one.
	fallback, ok := pickService(services, "en9")
	if !ok || fallback.name != "Wi-Fi" {
		t.Fatalf("fallback = %+v ok=%v", fallback, ok)
	}

	if _, ok := pickService(nil, "en0"); ok {
		t.Fatal("expected no service")
	}
}

func TestParseDefaultInterface(t *testing.T) {
	output := `   route to: default
destination: default
       mask: default
    gateway: 192.168.1.1
  interface: en0
      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING>`
	if got := parseDefaultInterface(output); got != "en0" {
		t.Fatalf("interface = %q", got)
	}
	if got := parseDefaultInterface("no route here"); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestDarwinEnableSteps(t *testing.T) {
	steps := darwinEnableSteps("Wi-Fi", 7890, mergeBypass(nil))
	want := []step{
		{"networksetup", []string{"-setwebproxy", "Wi-Fi", "127.0.0.1", "7890"}},
		{"networksetup", []string{"-setsecurewebproxy", "Wi-Fi", "127.0.0.1", "7890"}},
		{"networksetup", []string{"-setsocksfirewallproxy", "Wi-Fi", "127.0.0.1", "7890"}},
		{"networksetup", []string{
			"-setproxybypassdomains", "Wi-Fi", "127.0.0.1", "localhost", "*.local", "<local>",
			"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
		}},
	}
	if !reflect.DeepEqual(steps, want) {
		t.Fatalf("steps = %+v", steps)
	}
}

func TestMergeBypassKeepsUserEntries(t *testing.T) {
	merged := mergeBypass([]string{"127.0.0.1", "*.crashlytics.com", "<local>"})

	if merged[0] != "127.0.0.1" || merged[1] != "*.crashlytics.com" {
		t.Fatalf("user order not preserved: %v", merged)
	}
	count := map[string]int{}
	for _, host := range merged {
		count[host]++
	}
	if count["127.0.0.1"] != 1 || count["<local>"] != 1 {
		t.Fatalf("duplicates in %v", merged)
	}
	for _, want := range bypassHosts {
		if count[want] != 1 {
			t.Fatalf("%q missing from %v", want, merged)
		}
	}
}

func TestParseBypass(t *testing.T) {
	if got := parseBypass("There aren't any proxy bypass domains set on Wi-Fi.\n"); got != nil {
		t.Fatalf("empty list = %v", got)
	}
	got := parseBypass("127.0.0.1\n*.local\n\n")
	if len(got) != 2 || got[0] != "127.0.0.1" || got[1] != "*.local" {
		t.Fatalf("parsed = %v", got)
	}
}

func TestDarwinDisableStepsOnlyFlipStates(t *testing.T) {
	for _, s := range darwinDisableSteps("Wi-Fi") {
		if strings.Contains(strings.Join(s.args, " "), "bypass") {
			t.Fatalf("disable must not touch the bypass list: %+v", s)
		}
	}
}

func TestLinuxSteps(t *testing.T) {
	steps := linuxEnableSteps(7891)
	joined := make([]string, 0, len(steps))
	for _, s := range steps {
		joined = append(joined, s.name+" "+strings.Join(s.args, " "))
	}
	all := strings.Join(joined, "\n")
	for _, want := range []string{
		"org.gnome.system.proxy mode manual",
		"org.gnome.system.proxy.http port 7891",
		"org.gnome.system.proxy.https port 7891",
		"org.gnome.system.proxy.socks port 7891",
		"ignore-hosts ['127.0.0.1', 'localhost', '*.local', '<local>', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']",
	} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in\n%s", want, all)
		}
	}

	disable := linuxDisableSteps()
	if len(disable) != 1 || disable[0].args[3] != "none" {
		t.Fatalf("disable = %+v", disable)
	}
}

func TestWindowsSteps(t *testing.T) {
	enable := windowsEnableSteps(7890)
	if len(enable) != 3 {
		t.Fatalf("enable = %+v", enable)
	}
	all := make([]string, 0, len(enable))
	for _, s := range enable {
		all = append(all, strings.Join(s.args, " "))
	}
	joined := strings.Join(all, "\n")
	for _, want := range []string{
		"ProxyEnable /t REG_DWORD /d 1 /f",
		"ProxyServer /t REG_SZ /d 127.0.0.1:7890 /f",
		"ProxyOverride /t REG_SZ /d 127.0.0.1;localhost;<local> /f",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing %q in\n%s", want, joined)
		}
	}

	disable := windowsDisableSteps()
	if len(disable) != 1 || !strings.Contains(strings.Join(disable[0].args, " "), "ProxyEnable /t REG_DWORD /d 0 /f") {
		t.Fatalf("disable = %+v", disable)
	}
}

func TestEnableRejectsInvalidPort(t *testing.T) {
	manager := NewWithRunner(func(_ context.Context, _ string, _ ...string) ([]byte, error) {
		return nil, nil
	})
	if err := manager.Enable(context.Background(), 0); err == nil {
		t.Fatal("expected an error for port 0")
	}
}
