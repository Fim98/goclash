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

	"changeme/internal/mihomo"
)

// fakeKernel is a mihomo controller good enough for the gateway's calls.
type fakeKernel struct {
	mu      sync.Mutex
	mode    string
	patches []map[string]any
	selects map[string]string
	reloads []string
}

func newKernel(t *testing.T) (*httptest.Server, *fakeKernel) {
	t.Helper()
	state := &fakeKernel{mode: "rule", selects: map[string]string{}}

	proxies := map[string]any{
		"节点选择": map[string]any{"name": "节点选择", "type": "Selector", "now": "香港 01", "all": []string{"香港 01", "日本 01"}},
		"自动选择": map[string]any{"name": "自动选择", "type": "URLTest", "now": "日本 01", "all": []string{"日本 01"}},
		"香港 01": map[string]any{"name": "香港 01", "type": "Shadowsocks",
			"history": []map[string]any{{"time": "2026-01-01T00:00:00Z", "delay": 38}}},
		"日本 01": map[string]any{"name": "日本 01", "type": "Shadowsocks",
			"history": []map[string]any{{"time": "2026-01-01T00:00:00Z", "delay": 52}}},
		"DIRECT": map[string]any{"name": "DIRECT", "type": "Direct"},
		"REJECT": map[string]any{"name": "REJECT", "type": "Reject"},
	}

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
			state.patches = append(state.patches, patch)
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
		writeTestJSON(w, map[string]any{"proxies": proxies})
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
	return g
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
