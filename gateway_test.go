package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"changeme/internal/exitip"
	"changeme/internal/mihomo"
	"changeme/internal/service"
)

// fakeKernel is a mihomo controller good enough for the gateway's calls.
type fakeKernel struct {
	mu          sync.Mutex
	mode        string
	selectorNow string
	rejectPatch bool
	patches     []map[string]any
	selects     map[string]string
	reloads     []string
}

func newKernel(t *testing.T) (*httptest.Server, *fakeKernel) {
	t.Helper()
	state := &fakeKernel{mode: "rule", selects: map[string]string{}}

	mux := http.NewServeMux()
	mux.HandleFunc("/version", func(w http.ResponseWriter, r *http.Request) {
		writeTestJSON(w, map[string]any{"version": "1.19.4", "meta": true})
	})
	mux.HandleFunc("/configs", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch:
			var patch map[string]any
			_ = json.NewDecoder(r.Body).Decode(&patch)
			state.mu.Lock()
			reject := state.rejectPatch
			state.patches = append(state.patches, patch)
			state.mu.Unlock()
			if reject {
				http.Error(w, `{"message":"tun: operation not permitted"}`, http.StatusInternalServerError)
				return
			}
			state.mu.Lock()
			if mode, ok := patch["mode"].(string); ok {
				state.mode = mode
			}
			state.mu.Unlock()
			w.WriteHeader(http.StatusNoContent)
		case http.MethodPut:
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			state.mu.Lock()
			state.reloads = append(state.reloads, body["path"])
			state.mu.Unlock()
			w.WriteHeader(http.StatusNoContent)
		default:
			state.mu.Lock()
			mode := state.mode
			state.mu.Unlock()
			writeTestJSON(w, map[string]any{
				"mode": mode, "mixed-port": 7890, "allow-lan": false, "log-level": "info",
				"tun": map[string]any{"enable": false},
			})
		}
	})
	mux.HandleFunc("/proxies", func(w http.ResponseWriter, r *http.Request) {
		state.mu.Lock()
		now := state.selectorNow
		state.mu.Unlock()
		if now == "" {
			now = "香港 01"
		}
		writeTestJSON(w, map[string]any{"proxies": map[string]any{
			"节点选择": map[string]any{"name": "节点选择", "type": "Selector", "now": now, "all": []string{"香港 01", "日本 01"}},
			"自动选择": map[string]any{"name": "自动选择", "type": "URLTest", "now": "日本 01", "all": []string{"日本 01"}},
			"香港 01": map[string]any{"name": "香港 01", "type": "Shadowsocks",
				"history": []map[string]any{{"time": "2026-01-01T00:00:00Z", "delay": 38}}},
			"日本 01": map[string]any{"name": "日本 01", "type": "Shadowsocks",
				"history": []map[string]any{{"time": "2026-01-01T00:00:00Z", "delay": 52}}},
			"DIRECT": map[string]any{"name": "DIRECT", "type": "Direct"},
			"REJECT": map[string]any{"name": "REJECT", "type": "Reject"},
		}})
	})
	mux.HandleFunc("/proxies/", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		group := strings.TrimPrefix(r.URL.Path, "/proxies/")
		state.mu.Lock()
		state.selects[group] = body["name"]
		state.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/rules", func(w http.ResponseWriter, r *http.Request) {
		writeTestJSON(w, map[string]any{"rules": []map[string]any{
			{"type": "DOMAIN-SUFFIX", "payload": "google.com", "proxy": "节点选择", "size": 12},
			{"type": "MATCH", "payload": "", "proxy": "DIRECT", "size": 3},
		}})
	})
	mux.HandleFunc("/connections", func(w http.ResponseWriter, r *http.Request) {
		start := time.Now().Add(-90 * time.Second).UTC().Format(time.RFC3339)
		writeTestJSON(w, map[string]any{"connections": []map[string]any{
			{"id": "c1", "upload": 10, "download": 20, "start": start,
				"rule": "DOMAIN-SUFFIX", "rulePayload": "youtube.com", "chains": []string{"香港 01"},
				"metadata": map[string]any{"host": "www.youtube.com", "destinationPort": "443"}},
			{"id": "c2", "upload": 0, "download": 5, "start": start,
				"rule": "GEOIP", "rulePayload": "CN", "chains": []string{},
				"metadata": map[string]any{"host": "", "destinationIP": "10.0.0.5", "destinationPort": "53"}},
			{"id": "c3", "upload": 0, "download": 0, "start": start,
				"rule": "RULE-SET", "rulePayload": "reject-ads", "chains": []string{"REJECT"},
				"metadata": map[string]any{"host": "ads.example.com", "destinationPort": "443"}},
		}})
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, state
}

func newTestGateway(t *testing.T, srv *httptest.Server) *Gateway {
	t.Helper()
	g := newGatewayAt(t.TempDir())
	g.settings = defaultSettings()
	g.settings.ControllerAddr = strings.TrimPrefix(srv.URL, "http://")
	g.client = mihomo.New(g.settings.ControllerAddr, "")
	g.sysproxy = &fakeProxy{}
	g.services = &fakeService{state: service.StateMissing}
	// No test may reach the network: the default resolver reports "offline".
	g.lookupExit = func(context.Context) (exitip.Info, error) {
		return exitip.Info{}, fmt.Errorf("offline")
	}
	return g
}

// fakeProxy stands in for the OS layer so the suite never edits this machine's
// network settings.
type fakeProxy struct {
	mu      sync.Mutex
	enabled bool
	port    int
	fail    bool
	calls   int
}

func (f *fakeProxy) Enable(_ context.Context, port int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.fail {
		return fmt.Errorf("networksetup 拒绝了请求")
	}
	f.enabled, f.port = true, port
	return nil
}

func (f *fakeProxy) Disable(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.fail {
		return fmt.Errorf("networksetup 拒绝了请求")
	}
	f.enabled, f.port = false, 0
	return nil
}

// fakeService stands in for launchd.
type fakeService struct {
	mu         sync.Mutex
	state      service.State
	fail       bool
	installCfg service.Config
	installs   int
	uninstalls int
	kickstarts int
}

func (f *fakeService) Status(context.Context) (service.State, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.state, nil
}

func (f *fakeService) Install(_ context.Context, cfg service.Config) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return fmt.Errorf("已取消管理员授权")
	}
	f.installs++
	f.installCfg = cfg
	f.state = service.StateRunning
	return nil
}

func (f *fakeService) Uninstall(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return fmt.Errorf("卸载失败")
	}
	f.uninstalls++
	f.state = service.StateMissing
	return nil
}

func (f *fakeService) Kickstart(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return fmt.Errorf("kickstart 失败")
	}
	f.kickstarts++
	return nil
}

func (f *fakeProxy) state() (bool, int, int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.enabled, f.port, f.calls
}

func writeTestJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

func TestStatusMapsKernelState(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)

	status, err := g.Status(context.Background())
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if status.ExitNode != "香港 01" {
		t.Fatalf("exit node = %q", status.ExitNode)
	}
	if status.ExitLatency == nil || *status.ExitLatency != 38 {
		t.Fatalf("exit latency = %v", status.ExitLatency)
	}
	if status.Mode != "rule" || status.MixedPort != 7890 || status.CoreVersion != "1.19.4" {
		t.Fatalf("status = %+v", status)
	}
	if !status.Connected {
		t.Fatal("connected should follow the system proxy flag")
	}
}

func TestGroupsMapStrategiesAndLatency(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)

	groups, err := g.Groups(context.Background())
	if err != nil {
		t.Fatalf("Groups: %v", err)
	}
	if len(groups) != 2 {
		t.Fatalf("groups = %+v", groups)
	}
	byID := map[string]ProxyGroup{}
	for _, group := range groups {
		byID[group.ID] = group
	}
	selector := byID["节点选择"]
	if selector.Strategy != "select" || selector.Selected != "香港 01" {
		t.Fatalf("selector = %+v", selector)
	}
	if len(selector.Nodes) != 2 || selector.Nodes[0].Latency == nil || *selector.Nodes[0].Latency != 38 {
		t.Fatalf("nodes = %+v", selector.Nodes)
	}
	if byID["自动选择"].Strategy != "url-test" {
		t.Fatalf("auto group = %+v", byID["自动选择"])
	}
}

func TestSelectWritesThrough(t *testing.T) {
	srv, state := newKernel(t)
	g := newTestGateway(t, srv)

	if err := g.Select(context.Background(), "节点选择", "日本 01"); err != nil {
		t.Fatalf("Select: %v", err)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.selects["节点选择"] != "日本 01" {
		t.Fatalf("selects = %+v", state.selects)
	}
}

func TestRulesAndConnectionsMapping(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	ctx := context.Background()

	rules, err := g.Rules(ctx)
	if err != nil || len(rules) != 2 {
		t.Fatalf("Rules = %+v, %v", rules, err)
	}
	if rules[0].Policy != "节点选择" || rules[0].Hits != 12 {
		t.Fatalf("rule mapping = %+v", rules[0])
	}

	conns, err := g.Connections(ctx)
	if err != nil || len(conns) != 3 {
		t.Fatalf("Connections = %+v, %v", conns, err)
	}
	first := conns[0]
	if first.Host != "www.youtube.com:443" || first.Rule != "DOMAIN-SUFFIX,youtube.com" {
		t.Fatalf("connection = %+v", first)
	}
	if first.Kind != "proxy" || first.Exit != "香港 01" || first.DurationSeconds < 80 {
		t.Fatalf("connection = %+v", first)
	}
	if conns[1].Kind != "direct" || conns[1].Host != "10.0.0.5:53" {
		t.Fatalf("direct connection = %+v", conns[1])
	}
	if conns[2].Kind != "reject" {
		t.Fatalf("reject connection = %+v", conns[2])
	}
}

func TestSettingsPersistAndReachTheKernel(t *testing.T) {
	srv, state := newKernel(t)
	g := newTestGateway(t, srv)

	next, err := g.UpdateSettings(context.Background(), map[string]any{"mode": "global", "menuBarLatency": false})
	if err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}
	if next.Mode != "global" || next.MenuBarLatency {
		t.Fatalf("settings = %+v", next)
	}

	state.mu.Lock()
	patches := append([]map[string]any{}, state.patches...)
	state.mu.Unlock()
	if len(patches) != 1 || patches[0]["mode"] != "global" {
		t.Fatalf("kernel patches = %+v", patches)
	}

	// A fresh gateway over the same directory must load the written file.
	restored := &Gateway{dir: g.dir}
	restored.settings = restored.loadSettings()
	if restored.settings.Mode != "global" || restored.settings.MenuBarLatency {
		t.Fatalf("reloaded settings = %+v", restored.settings)
	}
}

func TestAddAndRemoveProfile(t *testing.T) {
	srv, state := newKernel(t)

	sub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("subscription-userinfo", "upload=100; download=200; total=1000; expire=1893456000")
		fmt.Fprint(w, "proxies:\n  - name: 香港 01\n    type: ss\n  - name: 日本 01\n    type: ss\n")
	}))
	t.Cleanup(sub.Close)

	g := newTestGateway(t, srv)
	ctx := context.Background()

	if err := g.AddProfile(ctx, sub.URL+"/sub?token=abcd1234"); err != nil {
		t.Fatalf("AddProfile: %v", err)
	}

	profiles, err := g.Profiles(ctx)
	if err != nil || len(profiles) != 1 {
		t.Fatalf("Profiles = %+v, %v", profiles, err)
	}
	profile := profiles[0]
	if !profile.Current || profile.UsedBytes != 300 || profile.TotalBytes != 1000 {
		t.Fatalf("profile = %+v", profile)
	}
	if profile.NodeCount != 2 {
		t.Fatalf("node count = %d", profile.NodeCount)
	}
	if strings.Contains(profile.URL, "abcd1234") || !strings.Contains(profile.URL, "…") {
		t.Fatalf("url not masked: %s", profile.URL)
	}
	if _, err := os.Stat(filepath.Join(g.dir, "profiles", profile.ID+".yaml")); err != nil {
		t.Fatalf("profile file: %v", err)
	}

	state.mu.Lock()
	reloads := append([]string{}, state.reloads...)
	state.mu.Unlock()
	if len(reloads) != 1 || !strings.HasSuffix(reloads[0], profile.ID+".yaml") {
		t.Fatalf("reloads = %+v", reloads)
	}

	if err := g.RemoveProfile(ctx, profile.ID); err != nil {
		t.Fatalf("RemoveProfile: %v", err)
	}
	profiles, _ = g.Profiles(ctx)
	if len(profiles) != 0 {
		t.Fatalf("profiles after remove = %+v", profiles)
	}
	if g.activeConfigPath() != "" {
		t.Fatalf("active profile should be cleared")
	}
}

func TestPing(t *testing.T) {
	g := &Gateway{}
	if !g.Ping() {
		t.Fatal("Ping should always be true inside the app")
	}
}

func TestSetSystemProxyAppliesThenPersists(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	proxy := g.sysproxy.(*fakeProxy)

	if err := g.SetSystemProxy(context.Background(), true); err != nil {
		t.Fatalf("SetSystemProxy: %v", err)
	}
	enabled, port, calls := proxy.state()
	if !enabled || port != 7890 || calls != 1 {
		t.Fatalf("proxy = enabled:%v port:%d calls:%d", enabled, port, calls)
	}
	if !g.Settings().SystemProxy {
		t.Fatal("flag should be persisted after a successful apply")
	}

	restored := &Gateway{dir: g.dir}
	restored.settings = restored.loadSettings()
	if !restored.settings.SystemProxy {
		t.Fatal("flag did not survive a reload")
	}
}

func TestSetSystemProxyFailureLeavesTheFlagOff(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	g.settings.SystemProxy = false
	proxy := g.sysproxy.(*fakeProxy)
	proxy.fail = true

	if err := g.SetSystemProxy(context.Background(), true); err == nil {
		t.Fatal("expected the OS error to surface")
	}
	if g.Settings().SystemProxy {
		t.Fatal("a failed apply must not flip the persisted flag")
	}
}

func TestUpdateSettingsRoutesSystemProxyThroughTheOS(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	proxy := g.sysproxy.(*fakeProxy)

	if _, err := g.UpdateSettings(context.Background(), map[string]any{"systemProxy": false}); err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}
	enabled, _, calls := proxy.state()
	if enabled || calls != 1 {
		t.Fatalf("proxy = enabled:%v calls:%d", enabled, calls)
	}
	if g.Settings().SystemProxy {
		t.Fatal("settings page toggle was not persisted")
	}
}

func TestMixedPortChangeReappliesSystemProxy(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	g.settings.SystemProxy = true
	proxy := g.sysproxy.(*fakeProxy)

	if _, err := g.UpdateSettings(context.Background(), map[string]any{"mixedPort": 7891}); err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}
	_, port, _ := proxy.state()
	if port != 7891 {
		t.Fatalf("proxy port = %d, want 7891", port)
	}
}

func TestAutoUpdateDelayFollowsSettings(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)

	if got := g.autoUpdateDelay(); got != 12*time.Hour {
		t.Fatalf("default delay = %v", got)
	}
	g.settings.AutoUpdateIntervalHour = 6
	if got := g.autoUpdateDelay(); got != 6*time.Hour {
		t.Fatalf("6h delay = %v", got)
	}
	g.settings.AutoUpdateEnabled = false
	if got := g.autoUpdateDelay(); got != 5*time.Minute {
		t.Fatalf("disabled delay = %v", got)
	}
}

func TestSelectLowestLatencySwitchesTheMainGroup(t *testing.T) {
	srv, state := newKernel(t)
	g := newTestGateway(t, srv)

	// The selector currently sits on the slower node; the refresh should move
	// it to the 38 ms one without re-probing anything.
	state.mu.Lock()
	state.selectorNow = "日本 01"
	state.mu.Unlock()

	g.selectLowestLatency(context.Background())

	state.mu.Lock()
	defer state.mu.Unlock()
	if state.selects["节点选择"] != "香港 01" {
		t.Fatalf("selects = %+v", state.selects)
	}
}

func TestSelectLowestLatencyKeepsTheCurrentNodeWhenItIsFastest(t *testing.T) {
	srv, state := newKernel(t)
	g := newTestGateway(t, srv)

	g.selectLowestLatency(context.Background())

	state.mu.Lock()
	defer state.mu.Unlock()
	if len(state.selects) != 0 {
		t.Fatalf("unexpected switch: %+v", state.selects)
	}
}

func TestRelativeTime(t *testing.T) {
	if got := relativeTime(0); got != "" {
		t.Fatalf("zero = %q", got)
	}
	if got := relativeTime(time.Now().Unix()); got != "刚刚" {
		t.Fatalf("now = %q", got)
	}
	if got := relativeTime(time.Now().Add(-3 * time.Hour).Unix()); got != "3 小时前" {
		t.Fatalf("3h = %q", got)
	}
	if got := relativeTime(time.Now().Add(-50 * time.Hour).Unix()); got != "2 天前" {
		t.Fatalf("50h = %q", got)
	}
}

func TestApplyOnStartRequiresAReachableKernel(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	g.settings.SystemProxy = true
	proxy := g.sysproxy.(*fakeProxy)

	g.applyOnStart(context.Background())
	if enabled, _, _ := proxy.state(); !enabled {
		t.Fatal("a live kernel should get the system proxy applied")
	}
}

func TestApplyOnStartLeavesTheOSAloneWithoutAKernel(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	g.settings.SystemProxy = true
	proxy := g.sysproxy.(*fakeProxy)
	srv.Close()

	g.applyOnStart(context.Background())
	if enabled, _, calls := proxy.state(); enabled || calls != 0 {
		t.Fatalf("proxy = enabled:%v calls:%d, want untouched", enabled, calls)
	}
}

func TestTrayLabelFollowsTheSettingAndTheKernel(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)

	if got := trayLabel(context.Background(), g); got != "38 ms" {
		t.Fatalf("label = %q, want the exit latency", got)
	}

	g.settings.MenuBarLatency = false
	if got := trayLabel(context.Background(), g); got != "" {
		t.Fatalf("label with the setting off = %q", got)
	}

	g.settings.MenuBarLatency = true
	srv.Close()
	if got := trayLabel(context.Background(), g); got != "" {
		t.Fatalf("label with the kernel down = %q", got)
	}
}

func TestTunRequiresThePrivilegedService(t *testing.T) {
	srv, state := newKernel(t)
	g := newTestGateway(t, srv)

	_, err := g.UpdateSettings(context.Background(), map[string]any{"tun": true})
	if err == nil || !strings.Contains(err.Error(), "系统服务") {
		t.Fatalf("err = %v", err)
	}
	if g.Settings().Tun {
		t.Fatal("a refused TUN must not be persisted")
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if len(state.patches) != 0 {
		t.Fatalf("kernel should not be touched: %+v", state.patches)
	}
}

func TestTunPassesWhenTheServiceRuns(t *testing.T) {
	srv, state := newKernel(t)
	g := newTestGateway(t, srv)
	g.services.(*fakeService).state = service.StateRunning

	next, err := g.UpdateSettings(context.Background(), map[string]any{"tun": true})
	if err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}
	if !next.Tun || !g.Settings().Tun {
		t.Fatal("TUN should be saved once the daemon is running")
	}

	state.mu.Lock()
	defer state.mu.Unlock()
	last := state.patches[len(state.patches)-1]
	tun, _ := last["tun"].(map[string]any)
	if tun["enable"] != true {
		t.Fatalf("kernel patch = %+v", last)
	}
}

func TestInstallServiceHandsOverTheActiveProfile(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	g.settings.CorePath = "/usr/local/bin/mihomo"
	g.profiles = []Profile{{ID: "p1", File: filepath.Join(g.dir, "profiles", "p1.yaml")}}
	g.activeID = "p1"

	if err := g.InstallService(context.Background()); err != nil {
		t.Fatalf("InstallService: %v", err)
	}
	fake := g.services.(*fakeService)
	if fake.installs != 1 {
		t.Fatalf("installs = %d", fake.installs)
	}
	if fake.installCfg.CorePath != "/usr/local/bin/mihomo" {
		t.Fatalf("core path = %q", fake.installCfg.CorePath)
	}
	if fake.installCfg.ConfigFile != filepath.Join(g.dir, "profiles", "p1.yaml") {
		t.Fatalf("config file = %q", fake.installCfg.ConfigFile)
	}
	if fake.installCfg.LogPath != filepath.Join(g.dir, "logs", "core.log") {
		t.Fatalf("log path = %q", fake.installCfg.LogPath)
	}
}

func TestInstallServiceSurfacesACanceledPrompt(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	fake := g.services.(*fakeService)
	fake.fail = true

	err := g.InstallService(context.Background())
	if err == nil || !strings.Contains(err.Error(), "取消") {
		t.Fatalf("err = %v", err)
	}
}

func TestRemoveServiceUnloadsTheDaemon(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	fake := g.services.(*fakeService)
	fake.state = service.StateRunning

	if err := g.RemoveService(context.Background()); err != nil {
		t.Fatalf("RemoveService: %v", err)
	}
	if fake.uninstalls != 1 || fake.state != service.StateMissing {
		t.Fatalf("fake = %+v", fake)
	}
}

func TestRestartCorePrefersTheDaemon(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	fake := g.services.(*fakeService)
	fake.state = service.StateRunning

	if err := g.RestartCore(context.Background()); err != nil {
		t.Fatalf("RestartCore: %v", err)
	}
	if fake.kickstarts != 1 {
		t.Fatalf("kickstarts = %d", fake.kickstarts)
	}
}

func TestKernelRefusalIsNotPersisted(t *testing.T) {
	srv, state := newKernel(t)
	g := newTestGateway(t, srv)
	state.mu.Lock()
	state.rejectPatch = true
	state.mu.Unlock()

	if _, err := g.UpdateSettings(context.Background(), map[string]any{"mode": "global"}); err == nil {
		t.Fatal("expected the kernel error to surface")
	}
	if g.Settings().Mode != "rule" {
		t.Fatalf("mode = %q, want the old value", g.Settings().Mode)
	}
}

func TestStatusExposesTheCachedExit(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	g.lookupExit = func(context.Context) (exitip.Info, error) {
		return exitip.Info{IP: "118.163.198.44", Country: "TW", ASN: 3462, Org: "Chunghwa Telecom"}, nil
	}

	g.refreshExit(context.Background())
	status, err := g.Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if status.ExitIP != "118.163.198.44" {
		t.Fatalf("exit ip = %q", status.ExitIP)
	}
	if status.ExitRegion != "中国台湾" {
		t.Fatalf("region = %q", status.ExitRegion)
	}
	if status.ExitASN != "AS3462 · CHUNGHWA TELECOM" {
		t.Fatalf("asn line = %q", status.ExitASN)
	}
}

func TestExitIsEmptyWhenTheProxyIsOff(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	g.lookupExit = func(context.Context) (exitip.Info, error) {
		return exitip.Info{IP: "118.163.198.44", Country: "TW"}, nil
	}
	g.settings.SystemProxy = false

	g.refreshExit(context.Background())
	status, _ := g.Status(context.Background())
	if status.ExitIP != "" || status.ExitRegion != "" {
		t.Fatalf("status = %+v", status)
	}
}

func TestExitIsSkippedWithoutAnEndpoint(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	called := false
	g.lookupExit = func(context.Context) (exitip.Info, error) {
		called = true
		return exitip.Info{IP: "1.2.3.4"}, nil
	}
	g.settings.ExitIPEndpoint = ""

	g.refreshExit(context.Background())
	if called {
		t.Fatal("lookup should be skipped when the endpoint is empty")
	}
	if _, ok := g.exitSnapshot(); ok {
		t.Fatal("cache should stay empty")
	}
}

func TestRefreshExitIPReturnsFreshStatus(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	calls := 0
	g.lookupExit = func(context.Context) (exitip.Info, error) {
		calls++
		return exitip.Info{IP: "203.0.113.9", Country: "JP"}, nil
	}

	status, err := g.RefreshExitIP(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if calls != 1 || status.ExitIP != "203.0.113.9" || status.ExitRegion != "日本" {
		t.Fatalf("calls=%d status=%+v", calls, status)
	}
}

func TestLookupFailureDegradesToAnEmptyCard(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	g.lookupExit = func(context.Context) (exitip.Info, error) {
		return exitip.Info{}, fmt.Errorf("dial tcp: connection refused")
	}

	status, err := g.RefreshExitIP(context.Background())
	if err != nil {
		t.Fatalf("a lookup failure must not surface: %v", err)
	}
	if status.ExitIP != "" {
		t.Fatalf("exit ip = %q", status.ExitIP)
	}
}

func TestSelectInvalidatesTheCachedExit(t *testing.T) {
	srv, _ := newKernel(t)
	g := newTestGateway(t, srv)
	calls := 0
	g.lookupExit = func(context.Context) (exitip.Info, error) {
		calls++
		if calls == 1 {
			return exitip.Info{IP: "118.163.198.44", Country: "TW"}, nil
		}
		return exitip.Info{}, fmt.Errorf("offline")
	}
	g.refreshExit(context.Background())
	if _, ok := g.exitSnapshot(); !ok {
		t.Fatal("expected a cached exit")
	}

	if err := g.Select(context.Background(), "节点选择", "日本 01"); err != nil {
		t.Fatal(err)
	}
	// The cache is dropped synchronously, so a status read cannot show the old
	// country even before the background refresh finishes.
	if _, ok := g.exitSnapshot(); ok {
		t.Fatal("cache should be dropped after switching nodes")
	}
}

func TestRegionNameMapping(t *testing.T) {
	cases := map[string]string{
		"HK": "中国香港", "TW": "中国台湾", "MO": "中国澳门", "JP": "日本",
		"us": "美国", "GB": "英国", "ZZ": "ZZ", "": "",
	}
	for code, want := range cases {
		if got := regionName(code); got != want {
			t.Fatalf("regionName(%q) = %q, want %q", code, got, want)
		}
	}
}

func TestExitRefreshDelayBacksOff(t *testing.T) {
	if got := exitRefreshDelay(true); got != 5*time.Minute {
		t.Fatalf("healthy delay = %v", got)
	}
	if got := exitRefreshDelay(false); got != 30*time.Second {
		t.Fatalf("retry delay = %v", got)
	}
}
