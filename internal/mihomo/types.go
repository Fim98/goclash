// Package mihomo is a minimal client for the mihomo (Clash Meta) external
// controller: the REST surface the UI needs plus the two WebSocket streams.
//
// It deliberately mirrors the API 1:1 — no caching, no retries — so the gateway
// above it can decide policy (reconnect backoff, event fan-out, degradation).
package mihomo

// Version is GET /version.
type Version struct {
	Version string `json:"version"`
	Meta    bool   `json:"meta"`
}

// Configs is the subset of GET /configs the UI reads.
type Configs struct {
	Mode      string `json:"mode"`
	MixedPort int    `json:"mixed-port"`
	AllowLan  bool   `json:"allow-lan"`
	LogLevel  string `json:"log-level"`
	Tun       struct {
		Enable bool `json:"enable"`
	} `json:"tun"`
}

// HistoryEntry is one delay probe result.
type HistoryEntry struct {
	Time  string `json:"time"`
	Delay int    `json:"delay"`
}

// Proxy is one entry of GET /proxies: either a group or a node.
type Proxy struct {
	Name    string         `json:"name"`
	Type    string         `json:"type"`
	Now     string         `json:"now"`
	All     []string       `json:"all"`
	History []HistoryEntry `json:"history"`
}

// ProxiesResponse is the envelope of GET /proxies.
type ProxiesResponse struct {
	Proxies map[string]Proxy `json:"proxies"`
}

// Connection is one entry of GET /connections.
type Connection struct {
	ID       string `json:"id"`
	Upload   int64  `json:"upload"`
	Download int64  `json:"download"`
	Start    string `json:"start"`
	Rule     string `json:"rule"`
	RulePay  string `json:"rulePayload"`
	Chains   []string
	Metadata struct {
		Host            string `json:"host"`
		DestinationIP   string `json:"destinationIP"`
		DestinationPort string `json:"destinationPort"`
		Network         string `json:"network"`
	} `json:"metadata"`
}

// ConnectionsResponse is the envelope of GET /connections.
type ConnectionsResponse struct {
	Connections []Connection `json:"connections"`
}

// Rule is one entry of GET /rules.
type Rule struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
	Proxy   string `json:"proxy"`
	Size    int    `json:"size"`
}

// RulesResponse is the envelope of GET /rules.
type RulesResponse struct {
	Rules []Rule `json:"rules"`
}

// Traffic is one message of the /traffic stream.
type Traffic struct {
	Up   int64 `json:"up"`
	Down int64 `json:"down"`
}

// Log is one message of the /logs stream.
type Log struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
}
