// Package exitip resolves the IP a user actually appears as on the internet.
//
// The request must go through the kernel's mixed port: asking over a direct
// connection would report the local address, which is the one thing nobody
// wants to see on a proxy client's home screen.
package exitip

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Info is what the answer can tell us. Fields the endpoint does not provide are
// left zero — the UI degrades to the parts it has.
type Info struct {
	IP      string
	Country string // ISO 3166-1 alpha-2, upper case
	ASN     int
	Org     string
	Native  bool
}

// Label renders the secondary line on the IP card, e.g. "AS3462 · CHUNGHWA".
func (i Info) Label() string {
	org := strings.ToUpper(strings.TrimSpace(i.Org))
	if i.ASN > 0 && org != "" {
		return fmt.Sprintf("AS%d · %s", i.ASN, org)
	}
	if i.ASN > 0 {
		return fmt.Sprintf("AS%d", i.ASN)
	}
	return org
}

// Client queries one endpoint through the supplied proxy address.
type Client struct {
	endpoint string
	http     *http.Client
}

// New builds a client. proxyAddr is host:port of the mixed listener; empty
// means a direct request.
func New(endpoint, proxyAddr string) *Client {
	transport := &http.Transport{
		// Cloned so we never mutate http.DefaultTransport.
		Proxy:                 nil,
		MaxIdleConns:          2,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   6 * time.Second,
		ResponseHeaderTimeout: 6 * time.Second,
		DialContext: (&net.Dialer{
			Timeout: 6 * time.Second,
		}).DialContext,
	}
	if proxyAddr != "" {
		transport.Proxy = http.ProxyURL(&url.URL{Scheme: "http", Host: proxyAddr})
	}
	return &Client{
		endpoint: endpoint,
		http:     &http.Client{Timeout: 8 * time.Second, Transport: transport},
	}
}

// Lookup performs one query. Failures are expected (proxy off, endpoint
// blocked, no network) and are reported as errors for the caller to swallow.
func (c *Client) Lookup(ctx context.Context) (Info, error) {
	if strings.TrimSpace(c.endpoint) == "" {
		return Info{}, errors.New("未配置出口 IP 查询地址")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint, nil)
	if err != nil {
		return Info{}, err
	}
	request.Header.Set("User-Agent", "GoClash/3.0")
	request.Header.Set("Accept", "application/json, text/plain")

	response, err := c.http.Do(request)
	if err != nil {
		return Info{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Info{}, fmt.Errorf("出口查询返回 %s", response.Status)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, 64*1024))
	if err != nil {
		return Info{}, err
	}
	info, err := parse(body)
	if err != nil {
		return Info{}, err
	}
	return info, nil
}

// parse accepts both shapes we support: a JSON object (ip.sb and friends) and
// Cloudflare's `key=value` trace text.
func parse(body []byte) (Info, error) {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return Info{}, errors.New("出口查询返回空内容")
	}
	if strings.HasPrefix(trimmed, "{") {
		return parseJSON([]byte(trimmed))
	}
	return parseTrace(trimmed)
}

type jsonDoc struct {
	IP           string          `json:"ip"`
	CountryCode  string          `json:"country_code"`
	Country      string          `json:"country"`
	ASN          json.RawMessage `json:"asn"`
	ASNOrg       string          `json:"asn_organization"`
	Organization string          `json:"organization"`
	ISP          string          `json:"isp"`
	Native       *bool           `json:"is_native"`
}

func parseJSON(body []byte) (Info, error) {
	var doc jsonDoc
	if err := json.Unmarshal(body, &doc); err != nil {
		return Info{}, err
	}
	info := Info{
		IP:      strings.TrimSpace(doc.IP),
		Country: strings.ToUpper(strings.TrimSpace(doc.CountryCode)),
		ASN:     parseASN(doc.ASN),
		Org:     firstNonEmpty(doc.ASNOrg, doc.Organization, doc.ISP),
	}
	if doc.Native != nil {
		info.Native = *doc.Native
	}
	if info.IP == "" {
		return Info{}, errors.New("出口查询未返回 IP")
	}
	return info, nil
}

// parseTrace reads Cloudflare's cdn-cgi/trace: one key=value per line.
func parseTrace(body string) (Info, error) {
	info := Info{}
	for _, line := range strings.Split(body, "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), "=")
		if !found {
			continue
		}
		switch key {
		case "ip":
			info.IP = strings.TrimSpace(value)
		case "loc":
			info.Country = strings.ToUpper(strings.TrimSpace(value))
		}
	}
	if info.IP == "" {
		return Info{}, errors.New("出口查询未返回 IP")
	}
	return info, nil
}

// parseASN accepts 3462, "3462" and "AS3462".
func parseASN(raw json.RawMessage) int {
	if len(raw) == 0 {
		return 0
	}
	text := strings.Trim(strings.TrimSpace(string(raw)), `"`)
	text = strings.TrimPrefix(strings.ToUpper(text), "AS")
	number, err := strconv.Atoi(text)
	if err != nil {
		return 0
	}
	return number
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
