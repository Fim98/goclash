package mihomo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coder/websocket"
)

// Client talks to one mihomo external controller.
type Client struct {
	baseURL string
	secret  string
	http    *http.Client
}

// New builds a client for the controller at addr (host:port, no scheme).
func New(addr, secret string) *Client {
	return &Client{
		baseURL: "http://" + strings.TrimSuffix(strings.TrimPrefix(addr, "http://"), "/"),
		secret:  secret,
		http:    &http.Client{Timeout: 8 * time.Second},
	}
}

// Addr returns the controller address the client targets.
func (c *Client) Addr() string { return c.baseURL }

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.secret != "" {
		req.Header.Set("Authorization", "Bearer "+c.secret)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("mihomo %s %s: %s %s", method, path, resp.Status, strings.TrimSpace(string(payload)))
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// Version probes the controller; a nil error means the kernel is answering.
func (c *Client) Version(ctx context.Context) (Version, error) {
	var out Version
	err := c.do(ctx, http.MethodGet, "/version", nil, &out)
	return out, err
}

func (c *Client) Configs(ctx context.Context) (Configs, error) {
	var out Configs
	err := c.do(ctx, http.MethodGet, "/configs", nil, &out)
	return out, err
}

// PatchConfigs writes the given keys (mode, mixed-port, tun.enable…).
func (c *Client) PatchConfigs(ctx context.Context, patch map[string]any) error {
	return c.do(ctx, http.MethodPatch, "/configs", patch, nil)
}

// ReloadConfig asks the kernel to reload the config file at path.
func (c *Client) ReloadConfig(ctx context.Context, path string) error {
	return c.do(ctx, http.MethodPut, "/configs?force=true", map[string]string{"path": path}, nil)
}

func (c *Client) Proxies(ctx context.Context) (map[string]Proxy, error) {
	var out ProxiesResponse
	err := c.do(ctx, http.MethodGet, "/proxies", nil, &out)
	return out.Proxies, err
}

// Select switches the group to the named node.
func (c *Client) Select(ctx context.Context, group, node string) error {
	path := "/proxies/" + url.PathEscape(group)
	return c.do(ctx, http.MethodPut, path, map[string]string{"name": node}, nil)
}

// Delay probes a node and returns its round-trip in milliseconds.
func (c *Client) Delay(ctx context.Context, name, probeURL string, timeoutMS int) (int, error) {
	query := url.Values{}
	query.Set("timeout", fmt.Sprint(timeoutMS))
	query.Set("url", probeURL)
	var out struct {
		Delay int `json:"delay"`
	}
	err := c.do(ctx, http.MethodGet, "/proxies/"+url.PathEscape(name)+"/delay?"+query.Encode(), nil, &out)
	return out.Delay, err
}

func (c *Client) Connections(ctx context.Context) ([]Connection, error) {
	var out ConnectionsResponse
	err := c.do(ctx, http.MethodGet, "/connections", nil, &out)
	return out.Connections, err
}

func (c *Client) CloseConnection(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/connections/"+url.PathEscape(id), nil, nil)
}

func (c *Client) CloseAllConnections(ctx context.Context) error {
	return c.do(ctx, http.MethodDelete, "/connections", nil, nil)
}

func (c *Client) Rules(ctx context.Context) ([]Rule, error) {
	var out RulesResponse
	err := c.do(ctx, http.MethodGet, "/rules", nil, &out)
	return out.Rules, err
}

// Stream dials one of the kernel's WebSocket streams (/traffic, /logs) and
// hands every message body to the callback until the context ends.
func (c *Client) Stream(ctx context.Context, path string, onMessage func([]byte) error) error {
	wsURL := "ws" + strings.TrimPrefix(c.baseURL, "http") + path
	opts := &websocket.DialOptions{}
	if c.secret != "" {
		opts.HTTPHeader = http.Header{"Authorization": []string{"Bearer " + c.secret}}
	}

	conn, _, err := websocket.Dial(ctx, wsURL, opts)
	if err != nil {
		return err
	}
	defer conn.CloseNow()

	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return err
		}
		if err := onMessage(data); err != nil {
			return err
		}
	}
}
