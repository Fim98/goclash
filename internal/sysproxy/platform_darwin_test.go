//go:build darwin

package sysproxy

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// recorder fakes the shell so the darwin wiring can be asserted without
// touching the machine's real proxy settings.
type recorder struct {
	calls [][]string
	fail  map[string]bool
}

func (r *recorder) run(_ context.Context, name string, args ...string) ([]byte, error) {
	r.calls = append(r.calls, append([]string{name}, args...))
	if r.fail[name] {
		return []byte("boom"), errors.New("exit status 1")
	}
	switch {
	case name == "route":
		return []byte("  interface: en0\n"), nil
	case name == "networksetup" && len(args) > 0 && args[0] == "-listnetworkserviceorder":
		return []byte(serviceOrder), nil
	}
	return nil, nil
}

func TestEnableUsesDefaultRouteService(t *testing.T) {
	rec := &recorder{}
	manager := NewWithRunner(rec.run)
	if err := manager.Enable(context.Background(), 7890); err != nil {
		t.Fatal(err)
	}

	// Wi-Fi (en0) carries the default route, so the idle USB adapter is skipped.
	var joined []string
	for _, call := range rec.calls {
		joined = append(joined, strings.Join(call, " "))
	}
	all := strings.Join(joined, "\n")
	for _, want := range []string{
		"networksetup -setwebproxy Wi-Fi 127.0.0.1 7890",
		"networksetup -setsecurewebproxy Wi-Fi 127.0.0.1 7890",
		"networksetup -setsocksfirewallproxy Wi-Fi 127.0.0.1 7890",
	} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in\n%s", want, all)
		}
	}
	if strings.Contains(all, "USB 10/100/1000") {
		t.Fatalf("applied to the wrong service:\n%s", all)
	}
}

func TestEnableReportsServiceFailure(t *testing.T) {
	rec := &recorder{fail: map[string]bool{"networksetup": true}}
	manager := NewWithRunner(rec.run)
	err := manager.Enable(context.Background(), 7890)
	if err == nil || !strings.Contains(err.Error(), "网络服务列表") {
		t.Fatalf("err = %v", err)
	}
}
