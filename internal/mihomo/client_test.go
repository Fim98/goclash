package mihomo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/coder/websocket"
)

func TestRESTRoundTrip(t *testing.T) {
	var gotSelect map[string]string
	mux := http.NewServeMux()
	mux.HandleFunc("/version", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"version": "1.19.4", "meta": true})
	})
	mux.HandleFunc("/configs", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"mode":       "rule",
			"mixed-port": 7890,
			"allow-lan":  false,
			"log-level":  "info",
			"tun":        map[string]any{"enable": false},
		})
	})
	mux.HandleFunc("/proxies", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"proxies": map[string]any{
			"节点选择": map[string]any{
				"name": "节点选择", "type": "Selector", "now": "香港 01",
				"all": []string{"香港 01"},
			},
			"香港 01": map[string]any{
				"name": "香港 01", "type": "Shadowsocks",
				"history": []map[string]any{{"time": "2026-01-01T00:00:00Z", "delay": 38}},
			},
		}})
	})
	mux.HandleFunc("/proxies/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("select method = %s, want PUT", r.Method)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotSelect)
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/rules", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"rules": []map[string]any{
			{"type": "DOMAIN-SUFFIX", "payload": "google.com", "proxy": "节点选择", "size": 12},
		}})
	})
	mux.HandleFunc("/connections", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"connections": []map[string]any{
			{
				"id": "c1", "upload": 10, "download": 20, "start": "2026-01-01T00:00:00Z",
				"rule": "DOMAIN-SUFFIX", "rulePayload": "youtube.com", "chains": []string{"香港 01"},
				"metadata": map[string]any{"host": "www.youtube.com", "destinationPort": "443"},
			},
		}})
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := New(strings.TrimPrefix(srv.URL, "http://"), "")
	ctx := context.Background()

	version, err := client.Version(ctx)
	if err != nil || version.Version != "1.19.4" {
		t.Fatalf("Version = %+v, %v", version, err)
	}

	configs, err := client.Configs(ctx)
	if err != nil || configs.MixedPort != 7890 || configs.Mode != "rule" {
		t.Fatalf("Configs = %+v, %v", configs, err)
	}

	proxies, err := client.Proxies(ctx)
	if err != nil || proxies["节点选择"].Now != "香港 01" {
		t.Fatalf("Proxies = %+v, %v", proxies, err)
	}

	if err := client.Select(ctx, "节点选择", "香港 01"); err != nil {
		t.Fatalf("Select: %v", err)
	}
	if gotSelect["name"] != "香港 01" {
		t.Fatalf("select body = %+v", gotSelect)
	}

	rules, err := client.Rules(ctx)
	if err != nil || len(rules) != 1 || rules[0].Size != 12 {
		t.Fatalf("Rules = %+v, %v", rules, err)
	}

	conns, err := client.Connections(ctx)
	if err != nil || len(conns) != 1 || conns[0].Metadata.Host != "www.youtube.com" {
		t.Fatalf("Connections = %+v, %v", conns, err)
	}
}

func TestDelayQuery(t *testing.T) {
	var query url.Values
	mux := http.NewServeMux()
	mux.HandleFunc("/proxies/", func(w http.ResponseWriter, r *http.Request) {
		query = r.URL.Query()
		writeJSON(w, map[string]any{"delay": 42})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := New(strings.TrimPrefix(srv.URL, "http://"), "")
	delay, err := client.Delay(context.Background(), "香港 01", "https://example.com/generate_204", 3000)
	if err != nil || delay != 42 {
		t.Fatalf("Delay = %d, %v", delay, err)
	}
	if query.Get("timeout") != "3000" || query.Get("url") != "https://example.com/generate_204" {
		t.Fatalf("delay query = %v", query)
	}
}

func TestSecretHeader(t *testing.T) {
	var auth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		writeJSON(w, map[string]any{"version": "1.19.4"})
	}))
	defer srv.Close()

	client := New(strings.TrimPrefix(srv.URL, "http://"), "secret")
	if _, err := client.Version(context.Background()); err != nil {
		t.Fatalf("Version: %v", err)
	}
	if auth != "Bearer secret" {
		t.Fatalf("Authorization = %q", auth)
	}
}

func TestErrorIncludesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "controller offline", http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	client := New(strings.TrimPrefix(srv.URL, "http://"), "")
	if _, err := client.Version(context.Background()); err == nil || !strings.Contains(err.Error(), "controller offline") {
		t.Fatalf("want body in error, got %v", err)
	}
}

func TestStreamDeliversMessages(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			t.Errorf("accept: %v", err)
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")
		_ = conn.Write(r.Context(), websocket.MessageText, []byte(`{"down":100,"up":20}`))
		_ = conn.Write(r.Context(), websocket.MessageText, []byte(`{"down":200,"up":30}`))
	}))
	defer srv.Close()

	client := New(strings.TrimPrefix(srv.URL, "http://"), "")
	var samples []Traffic
	err := client.Stream(context.Background(), "/traffic", func(raw []byte) error {
		var traffic Traffic
		if err := json.Unmarshal(raw, &traffic); err != nil {
			return err
		}
		samples = append(samples, traffic)
		return nil
	})
	if err == nil {
		t.Fatal("Stream should return when the socket closes")
	}
	if len(samples) != 2 || samples[1].Down != 200 {
		t.Fatalf("samples = %+v", samples)
	}
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}
