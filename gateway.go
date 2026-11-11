package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/wailsapp/wails/v3/pkg/application"

	"changeme/internal/corefetch"
	"changeme/internal/exitip"
	"changeme/internal/mihomo"
	"changeme/internal/service"
	"changeme/internal/sysproxy"
)

// Domain shapes shared with the frontend (see frontend/src/gateway/types.ts).
// Field names must stay camelCase — the TS contract consumes them directly.

type ProxyNode struct {
	Name    string `json:"name"`
	Latency *int   `json:"latency"`
}

type ProxyGroup struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	Strategy string      `json:"strategy"`
	Nodes    []ProxyNode `json:"nodes"`
	Selected string      `json:"selected,omitempty"`
}

type TrafficSample struct {
	Down        int64 `json:"down"`
	Up          int64 `json:"up"`
	Connections int   `json:"connections"`
}

type LogLine struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

type Connection struct {
	ID              string `json:"id"`
	Host            string `json:"host"`
	Rule            string `json:"rule"`
	Exit            string `json:"exit"`
	UploadBytes     int64  `json:"uploadBytes"`
	DownloadBytes   int64  `json:"downloadBytes"`
	DurationSeconds int    `json:"durationSeconds"`
	Kind            string `json:"kind"`
}

type Rule struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
	Policy  string `json:"policy"`
	Hits    int    `json:"hits"`
}

type Profile struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	URL        string `json:"url"`
	UsedBytes  int64  `json:"usedBytes"`
	TotalBytes int64  `json:"totalBytes"`
	NodeCount  int    `json:"nodeCount"`
	ExpiresAt  string `json:"expiresAt"`
	UpdatedAt  string `json:"updatedAt"`
	// UpdatedUnix is the source of truth for UpdatedAt; the label is formatted
	// on read so a card opened hours later does not still say 刚刚.
	UpdatedUnix int64 `json:"updatedUnix"`
	Current     bool  `json:"current"`
	// File and Source never leave Go: the UI only needs the masked URL.
	File   string `json:"-"`
	Source string `json:"-"`
}

type Status struct {
	Connected     bool   `json:"connected"`
	Mode          string `json:"mode"`
	SystemProxy   bool   `json:"systemProxy"`
	Tun           bool   `json:"tun"`
	MixedPort     int    `json:"mixedPort"`
	CoreVersion   string `json:"coreVersion"`
	UptimeSeconds int    `json:"uptimeSeconds"`
	ExitNode      string `json:"exitNode"`
	ExitLatency   *int   `json:"exitLatency"`
	ExitIP        string `json:"exitIp"`
	ExitASN       string `json:"exitAsn"`
	ExitRegion    string `json:"exitRegion"`
	// The ISO code the name above was derived from; the UI re-labels it in the
	// user's language instead of trusting a pre-rendered string.
	ExitRegionCode string `json:"exitRegionCode"`
	NativeIP       bool   `json:"nativeIp"`
}

// ServiceStatus is what the TUN row needs to render its hint.
type ServiceStatus struct {
	State string `json:"state"`
}

// CoreStatus describes the core binary on disk. State is "missing" (nothing to
// run), "ready", "outdated" (upstream has another version) or "downloading".
// Progress is 0–1 and only meaningful while downloading.
type CoreStatus struct {
	State    string  `json:"state"`
	Version  string  `json:"version"`
	Latest   string  `json:"latest"`
	Path     string  `json:"path"`
	Progress float64 `json:"progress"`
}

type Settings struct {
	SystemProxy            bool   `json:"systemProxy"`
	Tun                    bool   `json:"tun"`
	MixedPort              int    `json:"mixedPort"`
	AllowLan               bool   `json:"allowLan"`
	Mode                   string `json:"mode"`
	LogLevel               string `json:"logLevel"`
	AutoUpdateEnabled      bool   `json:"autoUpdateEnabled"`
	AutoUpdateIntervalHour int    `json:"autoUpdateIntervalHours"`
	AutoSwitchLowest       bool   `json:"autoSwitchLowestLatency"`
	ProxyDownload          bool   `json:"proxyDownload"`
	ChainedProxy           bool   `json:"chainedProxy"`
	CoreAutoUpdate         bool   `json:"coreAutoUpdate"`
	LaunchAtLogin          bool   `json:"launchAtLogin"`
	SilentStart            bool   `json:"silentStart"`
	CloseAction            string `json:"closeAction"`
	Channel                string `json:"channel"`
	Language               string `json:"language"`
	Theme                  string `json:"theme"`
	Accent                 string `json:"accent"`
	MenuBarLatency         bool   `json:"menuBarLatency"`

	// Not surfaced in the UI yet: where the controller lives and which binary
	// to spawn for the core.
	// Where the exit IP is looked up. Empty disables the query entirely.
	ExitIPEndpoint   string `json:"exitIPEndpoint,omitempty"`
	ControllerAddr   string `json:"controllerAddr,omitempty"`
	ControllerSecret string `json:"controllerSecret,omitempty"`
	CorePath         string `json:"corePath,omitempty"`
}

// Gateway is the Wails service the windows bind to. Every method maps onto the
// kernel's external controller; settings and profile metadata live in the app
// config directory so they survive restarts.
// proxyController is the OS-level system proxy. Tests inject a fake so the
// suite never edits the machine's network settings.
type proxyController interface {
	Enable(ctx context.Context, port int) error
	Disable(ctx context.Context) error
}

// serviceManager is the privileged launchd daemon that owns the core when TUN
// is on. Faked in tests for the same reason.
type serviceManager interface {
	Status(ctx context.Context) (service.State, error)
	Install(ctx context.Context, cfg service.Config) error
	Uninstall(ctx context.Context) error
	Kickstart(ctx context.Context) error
}

// coreSource is the release feed plus the installer. Faked in tests so the
// suite never reaches GitHub.
type coreSource interface {
	Latest(ctx context.Context, channel string) (corefetch.Release, error)
	Install(ctx context.Context, asset corefetch.Asset, version, root string, progress corefetch.ProgressFunc) (string, error)
}

// proxyAwareCoreSource builds a client per call so toggling "download through
// the proxy" takes effect without a restart.
type proxyAwareCoreSource struct{ g *Gateway }

func (p proxyAwareCoreSource) Latest(ctx context.Context, channel string) (corefetch.Release, error) {
	return p.g.coreFetcher().Latest(ctx, channel)
}

func (p proxyAwareCoreSource) Install(ctx context.Context, asset corefetch.Asset, version, root string, progress corefetch.ProgressFunc) (string, error) {
	return p.g.coreFetcher().Install(ctx, asset, version, root, progress)
}

type Gateway struct {
	app      *application.App
	client   *mihomo.Client
	core     *CoreProcess
	sysproxy proxyController
	services serviceManager
	cores    coreSource

	dir          string
	settingsMu   sync.Mutex
	settings     Settings
	profilesMu   sync.Mutex
	profiles     []Profile
	activeID     string
	started      time.Time
	connectionNo atomic.Int64

	// Core download state. Latest is a cache of the last successful check so
	// the settings page can render without touching the network.
	coreMu          sync.Mutex
	coreDownloading bool
	coreProgress    float64
	coreLatest      string

	exitMu sync.Mutex
	exit   exitip.Info
	exitOK bool
	// lookupExit is the seam tests replace so no request ever leaves the box.
	lookupExit func(context.Context) (exitip.Info, error)
}

func NewGateway() *Gateway {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return newGatewayAt(filepath.Join(dir, "GoClash"))
}

// newGatewayAt is the seam tests use: same wiring, a throwaway directory.
func newGatewayAt(dir string) *Gateway {
	_ = os.MkdirAll(filepath.Join(dir, "profiles"), 0o755)

	g := &Gateway{dir: dir, started: time.Now(), sysproxy: sysproxy.New(), services: service.New()}
	g.cores = proxyAwareCoreSource{g: g}
	g.lookupExit = g.lookupExitThroughKernel
	g.settings = g.loadSettings()
	g.coreLatest = g.loadCoreCache()
	g.client = mihomo.New(g.settings.ControllerAddr, g.settings.ControllerSecret)
	g.loadProfiles()
	g.adoptCore()
	if g.settings.CorePath != "" {
		g.core = &CoreProcess{bin: g.settings.CorePath, dir: g.dir, config: g.activeConfigPath()}
	}
	return g
}

// Attach gives the service the app handle used to emit events.
func (g *Gateway) Attach(app *application.App) { g.app = app }

// Ping proves the Go bridge exists; the frontend falls back to demo data only
// when this call cannot be made at all (plain browser, tests).
func (g *Gateway) Ping() bool { return true }

func (g *Gateway) Status(ctx context.Context) (Status, error) {
	version, err := g.client.Version(ctx)
	if err != nil {
		return Status{}, err
	}
	configs, err := g.client.Configs(ctx)
	if err != nil {
		return Status{}, err
	}
	proxies, _ := g.client.Proxies(ctx)
	exitNode, latency := currentExit(proxies, configs.Mode)
	settings := g.Settings()

	status := Status{
		Connected:     settings.SystemProxy,
		Mode:          configs.Mode,
		SystemProxy:   settings.SystemProxy,
		Tun:           configs.Tun.Enable,
		MixedPort:     configs.MixedPort,
		CoreVersion:   version.Version,
		UptimeSeconds: int(time.Since(g.started).Seconds()),
		ExitNode:      exitNode,
		ExitLatency:   latency,
	}

	// The lookup result is cached: Status is called on every page load and
	// must never wait for a third-party request.
	if info, ok := g.exitSnapshot(); ok && settings.SystemProxy {
		status.ExitIP = info.IP
		status.ExitASN = info.Label()
		status.ExitRegion = regionName(info.Country)
		status.ExitRegionCode = strings.ToUpper(info.Country)
		status.NativeIP = info.Native
	}
	return status, nil
}

// RefreshExitIP re-queries the endpoint and returns the fresh status. The UI's
// refresh button uses it; failures degrade to an empty IP rather than an error.
func (g *Gateway) RefreshExitIP(ctx context.Context) (Status, error) {
	g.refreshExit(ctx)
	return g.Status(ctx)
}

func (g *Gateway) Groups(ctx context.Context) ([]ProxyGroup, error) {
	proxies, err := g.client.Proxies(ctx)
	if err != nil {
		return nil, err
	}

	groups := make([]ProxyGroup, 0, 8)
	for name, proxy := range proxies {
		strategy, ok := strategyOf(proxy.Type)
		if !ok {
			continue
		}
		nodes := make([]ProxyNode, 0, len(proxy.All))
		for _, nodeName := range proxy.All {
			node := ProxyNode{Name: nodeName}
			if raw, ok := proxies[nodeName]; ok {
				node.Latency = lastDelay(raw)
			}
			nodes = append(nodes, node)
		}
		groups = append(groups, ProxyGroup{
			ID:       name,
			Name:     name,
			Strategy: strategy,
			Nodes:    nodes,
			Selected: proxy.Now,
		})
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].Name < groups[j].Name })
	return groups, nil
}

func (g *Gateway) Select(ctx context.Context, group, node string) error {
	if err := g.client.Select(ctx, group, node); err != nil {
		return err
	}
	g.invalidateExit()
	return nil
}

// TestGroup re-probes every node of one group; the kernel records the history.
func (g *Gateway) TestGroup(ctx context.Context, group string) error {
	proxies, err := g.client.Proxies(ctx)
	if err != nil {
		return err
	}
	proxy, ok := proxies[group]
	if !ok {
		return fmt.Errorf("策略组 %q 不存在", group)
	}
	probe(ctx, g.client, proxy.All)
	return nil
}

func (g *Gateway) TestAllGroups(ctx context.Context) error {
	proxies, err := g.client.Proxies(ctx)
	if err != nil {
		return err
	}
	var names []string
	for _, proxy := range proxies {
		if _, ok := strategyOf(proxy.Type); ok {
			names = append(names, proxy.All...)
		}
	}
	probe(ctx, g.client, names)
	return nil
}

func (g *Gateway) SetMode(ctx context.Context, mode string) error {
	if err := g.client.PatchConfigs(ctx, map[string]any{"mode": mode}); err != nil {
		return err
	}
	return g.updateSettings(func(s *Settings) { s.Mode = mode })
}

// SetSystemProxy flips the operating system proxy and only then persists the
// flag: if the OS refuses, the UI keeps showing the old state instead of a
// switch that lies.
func (g *Gateway) SetSystemProxy(ctx context.Context, on bool) error {
	if err := g.applySystemProxy(ctx, on); err != nil {
		g.log("error", "系统代理开关失败："+err.Error())
		return err
	}
	if err := g.updateSettings(func(s *Settings) { s.SystemProxy = on }); err != nil {
		return err
	}
	// Turning the proxy on (or off) changes what the exit query would answer.
	g.invalidateExit()
	return nil
}

func (g *Gateway) applySystemProxy(ctx context.Context, on bool) error {
	if g.sysproxy == nil {
		return nil
	}
	if on {
		return g.sysproxy.Enable(ctx, g.Settings().MixedPort)
	}
	return g.sysproxy.Disable(ctx)
}

// ServiceStatus reports whether the privileged daemon is installed and loaded.
func (g *Gateway) ServiceStatus(ctx context.Context) (ServiceStatus, error) {
	state, err := g.services.Status(ctx)
	if err != nil {
		return ServiceStatus{}, err
	}
	return ServiceStatus{State: string(state)}, nil
}

// InstallService writes the launchd daemon and hands the core over to it. The
// user-space core is stopped first so the two do not fight over the port.
func (g *Gateway) InstallService(ctx context.Context) error {
	settings := g.Settings()
	cfg := service.Config{
		CorePath:   settings.CorePath,
		ConfigDir:  g.dir,
		ConfigFile: g.activeConfigPath(),
		LogPath:    filepath.Join(g.dir, "logs", "core.log"),
	}
	if g.core != nil {
		g.core.Stop()
	}
	if err := g.services.Install(ctx, cfg); err != nil {
		if g.core != nil {
			_ = g.core.Start() // put the user-space core back
		}
		return err
	}
	g.log("info", "系统服务已安装并启动，TUN 现在可用")
	return nil
}

// RemoveService unloads the daemon and brings the user-space core back.
func (g *Gateway) RemoveService(ctx context.Context) error {
	if err := g.services.Uninstall(ctx); err != nil {
		return err
	}
	g.log("info", "系统服务已卸载")
	if g.core != nil {
		_ = g.core.Start()
	}
	return nil
}

// --- core binary -----------------------------------------------------------

// CoreStatus reports what is on disk and what the last check found. It never
// touches the network: the settings page calls it on every mount.
func (g *Gateway) CoreStatus() CoreStatus {
	g.coreMu.Lock()
	downloading, progress := g.coreDownloading, g.coreProgress
	g.coreMu.Unlock()

	path, version := g.installedCore()
	latest := g.latestCore()

	state := "missing"
	switch {
	case downloading:
		state = "downloading"
	case path == "":
		state = "missing"
	case latest != "" && latest != version:
		state = "outdated"
	default:
		state = "ready"
	}
	return CoreStatus{
		State:    state,
		Version:  version,
		Latest:   latest,
		Path:     path,
		Progress: progress,
	}
}

// CheckCoreUpdate asks GitHub for the newest release on the configured channel
// and caches the answer. A failed check leaves the previous answer in place.
func (g *Gateway) CheckCoreUpdate(ctx context.Context) (CoreStatus, error) {
	release, err := g.cores.Latest(ctx, g.Settings().Channel)
	if err != nil {
		return CoreStatus{}, err
	}
	g.setLatestCore(strings.TrimPrefix(release.Version, "v"))
	return g.CoreStatus(), nil
}

// DownloadCore fetches the platform build, installs it and hands the running
// process over to it. The previous core keeps working until the new binary is
// fully on disk, so a canceled or failed download changes nothing.
func (g *Gateway) DownloadCore(ctx context.Context) (CoreStatus, error) {
	g.coreMu.Lock()
	if g.coreDownloading {
		g.coreMu.Unlock()
		return CoreStatus{}, errors.New("内核正在下载中")
	}
	g.coreDownloading = true
	g.coreProgress = 0
	g.coreMu.Unlock()
	defer func() {
		g.coreMu.Lock()
		g.coreDownloading = false
		g.coreMu.Unlock()
	}()

	release, err := g.cores.Latest(ctx, g.Settings().Channel)
	if err != nil {
		return CoreStatus{}, err
	}
	version := release.Version
	if version == "" {
		return CoreStatus{}, errors.New("上游没有可用的内核版本")
	}
	asset, err := corefetch.Pick(release, runtime.GOOS, runtime.GOARCH)
	if err != nil {
		return CoreStatus{}, err
	}
	g.setLatestCore(strings.TrimPrefix(version, "v"))
	g.emit("gateway:core", g.CoreStatus())

	path, err := g.cores.Install(ctx, asset, version, g.dir, func(received, total int64) {
		ratio := 0.0
		if total > 0 {
			ratio = math.Min(1, float64(received)/float64(total))
		}
		g.coreMu.Lock()
		g.coreProgress = ratio
		g.coreMu.Unlock()
		g.emit("gateway:core", CoreStatus{State: "downloading", Latest: strings.TrimPrefix(version, "v"), Progress: ratio})
	})
	if err != nil {
		g.log("error", "内核下载失败："+err.Error())
		return CoreStatus{}, err
	}

	if err := g.updateSettings(func(s *Settings) { s.CorePath = path }); err != nil {
		return CoreStatus{}, err
	}
	g.log("info", "内核 "+strings.TrimPrefix(version, "v")+" 已安装："+path)
	g.handOverToNewCore(ctx, path)

	// Clear the flag before reading the status, otherwise the caller gets
	// "downloading" back from a download that already finished.
	g.coreMu.Lock()
	g.coreDownloading = false
	g.coreProgress = 1
	g.coreMu.Unlock()

	status := g.CoreStatus()
	g.emit("gateway:core", status)
	return status, nil
}

// handOverToNewCore points whatever currently runs the core at the new binary.
func (g *Gateway) handOverToNewCore(ctx context.Context, path string) {
	// The daemon owns the process when TUN is on: rewrite its plist and restart
	// the job instead of spawning a second core that would fight for the port.
	if state, err := g.services.Status(ctx); err == nil && state == service.StateRunning {
		cfg := service.Config{
			CorePath:   path,
			ConfigDir:  g.dir,
			ConfigFile: g.activeConfigPath(),
			LogPath:    filepath.Join(g.dir, "logs", "core.log"),
		}
		err := g.services.Install(ctx, cfg)
		if err == nil {
			return
		}
		// The admin prompt was canceled or launchd refused: keep the old
		// daemon and say so rather than leaving TUN silently broken.
		g.log("warn", "系统服务未能切换到新内核，稍后可在「网络」卡片里重装："+err.Error())
	}

	g.core = &CoreProcess{bin: path, dir: g.dir, config: g.activeConfigPath()}
	if err := g.core.Restart(); err != nil {
		g.log("error", "新内核未能启动："+err.Error())
	}
}

// installedCore resolves the binary path and its version, preferring the
// configured one so a user-picked core is never silently replaced.
func (g *Gateway) installedCore() (path, version string) {
	if configured := g.Settings().CorePath; configured != "" {
		if info, err := os.Stat(configured); err == nil && !info.IsDir() {
			return configured, versionFromPath(configured)
		}
	}
	// Nothing configured (first run, or settings were reset): adopt the newest
	// binary we already have on disk.
	if cores := corefetch.Installed(g.dir); len(cores) > 0 {
		return cores[0].Path, cores[0].Version
	}
	return "", ""
}

// adoptCore persists a discovered binary so the next start skips the scan.
func (g *Gateway) adoptCore() {
	if g.settings.CorePath != "" {
		return
	}
	if cores := corefetch.Installed(g.dir); len(cores) > 0 {
		g.settings.CorePath = cores[0].Path
		_ = g.saveSettings(g.settings)
	}
}

func (g *Gateway) latestCore() string {
	g.coreMu.Lock()
	defer g.coreMu.Unlock()
	return g.coreLatest
}

func (g *Gateway) setLatestCore(version string) {
	g.coreMu.Lock()
	g.coreLatest = version
	g.coreMu.Unlock()
	g.saveCoreCache(version)
}

// coreFetcher builds a client per call: the proxy toggle must apply to the
// download without restarting the app.
func (g *Gateway) coreFetcher() *corefetch.Client {
	transport := http.DefaultTransport
	if g.Settings().ProxyDownload {
		port := g.Settings().MixedPort
		transport = &http.Transport{Proxy: http.ProxyURL(&url.URL{Scheme: "http", Host: fmt.Sprintf("127.0.0.1:%d", port)})}
	}
	return corefetch.New(&http.Client{Timeout: 5 * time.Minute, Transport: transport})
}

func (g *Gateway) loadCoreCache() string {
	raw, err := os.ReadFile(filepath.Join(g.dir, "core.json"))
	if err != nil {
		return ""
	}
	var cache struct {
		Latest string `json:"latest"`
	}
	if json.Unmarshal(raw, &cache) != nil {
		return ""
	}
	return cache.Latest
}

func (g *Gateway) saveCoreCache(version string) {
	raw, err := json.MarshalIndent(map[string]string{"latest": version}, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(filepath.Join(g.dir, "core.json"), raw, 0o644)
}

// versionFromPath reads the version out of <root>/cores/v1.19.2/mihomo.
func versionFromPath(path string) string {
	parent := filepath.Base(filepath.Dir(path))
	if !strings.HasPrefix(parent, "v") {
		return ""
	}
	return strings.TrimPrefix(parent, "v")
}

func (g *Gateway) RestartCore(ctx context.Context) error {
	// When the daemon owns the core, launchd restarts it — not us.
	if state, err := g.services.Status(ctx); err == nil && state == service.StateRunning {
		if err := g.services.Kickstart(ctx); err != nil {
			return err
		}
		g.log("info", "内核已由系统服务重启")
		return nil
	}
	if g.core == nil {
		return errors.New("尚未配置内核路径：在 settings.json 里设置 corePath")
	}
	return g.core.Restart()
}

func (g *Gateway) Connections(ctx context.Context) ([]Connection, error) {
	raw, err := g.client.Connections(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Connection, 0, len(raw))
	now := time.Now()
	for _, conn := range raw {
		start, _ := time.Parse(time.RFC3339, conn.Start)
		duration := 0
		if !start.IsZero() {
			duration = int(now.Sub(start).Seconds())
		}
		exit := "DIRECT"
		if len(conn.Chains) > 0 {
			exit = conn.Chains[0]
		}
		kind := "proxy"
		switch {
		case isReject(exit, conn):
			kind = "reject"
		case len(conn.Chains) == 0:
			kind = "direct"
		}
		rule := conn.Rule
		if conn.RulePay != "" {
			rule = conn.Rule + "," + conn.RulePay
		}
		out = append(out, Connection{
			ID:              conn.ID,
			Host:            hostOf(conn),
			Rule:            rule,
			Exit:            exit,
			UploadBytes:     conn.Upload,
			DownloadBytes:   conn.Download,
			DurationSeconds: duration,
			Kind:            kind,
		})
	}
	g.connectionNo.Store(int64(len(out)))
	return out, nil
}

func (g *Gateway) CloseConnection(ctx context.Context, id string) error {
	return g.client.CloseConnection(ctx, id)
}

func (g *Gateway) CloseAllConnections(ctx context.Context) error {
	return g.client.CloseAllConnections(ctx)
}

func (g *Gateway) Rules(ctx context.Context) ([]Rule, error) {
	raw, err := g.client.Rules(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Rule, 0, len(raw))
	for _, rule := range raw {
		out = append(out, Rule{Type: rule.Type, Payload: rule.Payload, Policy: rule.Proxy, Hits: rule.Size})
	}
	return out, nil
}

// ReloadRules re-feeds the active profile to the kernel, which re-resolves the
// rule providers.
func (g *Gateway) ReloadRules(ctx context.Context) error {
	path := g.activeConfigPath()
	if path == "" {
		return errors.New("还没有可重新载入的订阅")
	}
	return g.client.ReloadConfig(ctx, path)
}

// ClearLogs is a no-op on the kernel side — the console owns its 512-line ring.
func (g *Gateway) ClearLogs() error { return nil }

func (g *Gateway) OpenLogDirectory() error { return openDirectory(g.dir) }

func (g *Gateway) OpenConfigDirectory() error { return openDirectory(g.dir) }

func (g *Gateway) Profiles(ctx context.Context) ([]Profile, error) {
	g.profilesMu.Lock()
	defer g.profilesMu.Unlock()

	nodeCount := 0
	if proxies, err := g.client.Proxies(ctx); err == nil {
		nodeCount = countNodes(proxies)
	}

	out := make([]Profile, 0, len(g.profiles))
	for _, profile := range g.profiles {
		profile.Current = profile.ID == g.activeID
		if profile.Current {
			profile.NodeCount = nodeCount
		}
		if label := relativeTime(profile.UpdatedUnix); label != "" {
			profile.UpdatedAt = label
		}
		out = append(out, profile)
	}
	return out, nil
}

func (g *Gateway) AddProfile(ctx context.Context, rawURL string) error {
	body, header, err := g.fetchSubscription(ctx, rawURL)
	if err != nil {
		return err
	}
	id := fmt.Sprintf("p%d", time.Now().UnixNano())
	_ = os.MkdirAll(filepath.Join(g.dir, "profiles"), 0o755)
	file := filepath.Join(g.dir, "profiles", id+".yaml")
	if err := os.WriteFile(file, body, 0o644); err != nil {
		return err
	}

	profile := Profile{
		ID:          id,
		Name:        hostLabel(rawURL),
		URL:         maskURL(rawURL),
		Source:      rawURL,
		NodeCount:   countProxies(body),
		UpdatedAt:   "刚刚",
		UpdatedUnix: time.Now().Unix(),
		File:        file,
	}
	profile.UsedBytes, profile.TotalBytes, profile.ExpiresAt = parseUserInfo(header)

	g.profilesMu.Lock()
	g.profiles = append(g.profiles, profile)
	g.activeID = id
	g.profilesMu.Unlock()
	g.saveProfiles()

	if err := g.client.ReloadConfig(ctx, file); err != nil {
		g.log("warn", "订阅已保存，但内核未能载入："+err.Error())
	}
	return nil
}

func (g *Gateway) RemoveProfile(ctx context.Context, id string) error {
	g.profilesMu.Lock()
	index := -1
	for i, profile := range g.profiles {
		if profile.ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		g.profilesMu.Unlock()
		return fmt.Errorf("订阅 %q 不存在", id)
	}
	removed := g.profiles[index]
	g.profiles = append(g.profiles[:index], g.profiles[index+1:]...)
	if g.activeID == id {
		g.activeID = ""
	}
	g.profilesMu.Unlock()

	_ = os.Remove(removed.File)
	g.saveProfiles()
	return nil
}

func (g *Gateway) RefreshProfile(ctx context.Context, id string) error {
	g.profilesMu.Lock()
	index := -1
	for i, profile := range g.profiles {
		if profile.ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		g.profilesMu.Unlock()
		return fmt.Errorf("订阅 %q 不存在", id)
	}
	rawURL := g.profiles[index].Source
	g.profilesMu.Unlock()

	body, header, err := g.fetchSubscription(ctx, rawURL)
	if err != nil {
		return err
	}

	g.profilesMu.Lock()
	profile := &g.profiles[index]
	if err := os.WriteFile(profile.File, body, 0o644); err != nil {
		g.profilesMu.Unlock()
		return err
	}
	profile.NodeCount = countProxies(body)
	profile.UpdatedUnix = time.Now().Unix()
	profile.UpdatedAt = "刚刚"
	profile.UsedBytes, profile.TotalBytes, profile.ExpiresAt = parseUserInfo(header)
	active := profile.ID == g.activeID
	file := profile.File
	g.profilesMu.Unlock()
	g.saveProfiles()

	if active {
		if err := g.client.ReloadConfig(ctx, file); err != nil {
			g.log("warn", "订阅已更新，但内核未能重载："+err.Error())
		}
	}
	return nil
}

func (g *Gateway) Settings() Settings {
	g.settingsMu.Lock()
	defer g.settingsMu.Unlock()
	return g.settings
}

// UpdateSettings merges a partial patch, pushes the kernel-owned subset and
// persists the result. Values the kernel does not know about stay local.
func (g *Gateway) UpdateSettings(ctx context.Context, patch map[string]any) (Settings, error) {
	current, err := json.Marshal(g.Settings())
	if err != nil {
		return Settings{}, err
	}
	var merged map[string]any
	if err := json.Unmarshal(current, &merged); err != nil {
		return Settings{}, err
	}
	for key, value := range patch {
		merged[key] = value
	}
	raw, err := json.Marshal(merged)
	if err != nil {
		return Settings{}, err
	}
	var next Settings
	if err := json.Unmarshal(raw, &next); err != nil {
		return Settings{}, err
	}

	// TUN needs the privileged daemon. Refusing here is better than letting the
	// kernel fail with an errno the user cannot act on.
	if _, ok := patch["tun"]; ok && next.Tun {
		state, err := g.services.Status(ctx)
		if err != nil {
			return Settings{}, err
		}
		if state != service.StateRunning {
			return Settings{}, errors.New("TUN 需要系统服务：先在「网络」卡片里安装服务")
		}
	}

	// The settings page patches systemProxy directly, so it has to go through
	// the same OS call as the hero switch.
	if _, ok := patch["systemProxy"]; ok {
		if err := g.applySystemProxy(ctx, next.SystemProxy); err != nil {
			g.log("error", "系统代理开关失败："+err.Error())
			return Settings{}, err
		}
	}

	// Push to the kernel before persisting: a value the kernel refused must not
	// be remembered as if it applied. Local-only keys produce no patch at all,
	// so changing the theme never needs a live kernel.
	kernel := map[string]any{}
	if _, ok := patch["mode"]; ok {
		kernel["mode"] = next.Mode
	}
	if _, ok := patch["tun"]; ok {
		kernel["tun"] = map[string]any{"enable": next.Tun}
	}
	if _, ok := patch["mixedPort"]; ok {
		kernel["mixed-port"] = next.MixedPort
	}
	if _, ok := patch["allowLan"]; ok {
		kernel["allow-lan"] = next.AllowLan
	}
	if _, ok := patch["logLevel"]; ok {
		kernel["log-level"] = next.LogLevel
	}
	if len(kernel) > 0 {
		if err := g.client.PatchConfigs(ctx, kernel); err != nil {
			g.log("error", "内核拒绝了设置："+err.Error())
			return Settings{}, err
		}
	}

	if err := g.updateSettings(func(s *Settings) { *s = next }); err != nil {
		return Settings{}, err
	}
	// A port change while the proxy is on must be reflected in the OS setting,
	// otherwise the system keeps pointing at a dead port.
	if _, ok := patch["mixedPort"]; ok && next.SystemProxy {
		if err := g.applySystemProxy(ctx, true); err != nil {
			g.log("error", "端口已修改，但系统代理未能重新应用："+err.Error())
		}
	}
	return next, nil
}

// Start launches the event pumps. Traffic and logs are pushed to the windows as
// Wails events; both reconnect on their own when the kernel is restarted.
func (g *Gateway) Start(ctx context.Context) {
	go g.pumpTraffic(ctx)
	go g.pumpLogs(ctx)
	go g.countConnections(ctx)
	go g.autoUpdateProfiles(ctx)
	go g.pumpExitIP(ctx)

	go g.applyOnStart(ctx)

	if state, err := g.services.Status(ctx); err == nil && state == service.StateRunning {
		g.log("info", "内核由系统服务托管，跳过本地启动")
	} else if g.core != nil {
		if err := g.core.Start(); err != nil {
			g.log("warn", "内核启动失败："+err.Error())
		}
	}
}

// applyOnStart re-points the OS at the kernel, but only once the kernel
// answers. The switch survives restarts, and applying it while no core is
// listening would send every request on the machine to a dead port.
func (g *Gateway) applyOnStart(ctx context.Context) {
	if !g.Settings().SystemProxy {
		return
	}
	if _, err := g.client.Version(ctx); err != nil {
		g.log("warn", "内核未响应，暂不应用系统代理："+err.Error())
		return
	}
	if err := g.applySystemProxy(ctx, true); err != nil {
		g.log("warn", "启动时未能应用系统代理："+err.Error())
	}
}

func (g *Gateway) Stop() {
	if g.Settings().SystemProxy && g.sysproxy != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = g.sysproxy.Disable(ctx)
		cancel()
	}
	if g.core != nil {
		g.core.Stop()
	}
}

func (g *Gateway) pumpTraffic(ctx context.Context) {
	for ctx.Err() == nil {
		_ = g.client.Stream(ctx, "/traffic", func(raw []byte) error {
			var traffic mihomo.Traffic
			if json.Unmarshal(raw, &traffic) != nil {
				return nil
			}
			g.emit("gateway:traffic", TrafficSample{
				Down:        traffic.Down,
				Up:          traffic.Up,
				Connections: int(g.connectionNo.Load()),
			})
			return nil
		})
		sleepCtx(ctx, 2*time.Second)
	}
}

func (g *Gateway) pumpLogs(ctx context.Context) {
	g.settingsMu.Lock()
	level := g.settings.LogLevel
	g.settingsMu.Unlock()
	path := "/logs?level=" + url.QueryEscape(level)

	for ctx.Err() == nil {
		_ = g.client.Stream(ctx, path, func(raw []byte) error {
			var entry mihomo.Log
			if json.Unmarshal(raw, &entry) != nil {
				return nil
			}
			g.emit("gateway:log", LogLine{
				Time:    time.Now().Format("15:04:05.000"),
				Level:   entry.Type,
				Message: entry.Payload,
			})
			return nil
		})
		sleepCtx(ctx, 2*time.Second)
	}
}

// autoUpdateProfiles refreshes every subscription on the configured interval.
// Disabling the master switch does not require a restart: the idle tick is
// short and each loop re-reads the settings.
func (g *Gateway) autoUpdateProfiles(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(g.autoUpdateDelay()):
			g.refreshAllProfiles(ctx)
		}
	}
}

func (g *Gateway) autoUpdateDelay() time.Duration {
	settings := g.Settings()
	if !settings.AutoUpdateEnabled {
		return 5 * time.Minute
	}
	hours := settings.AutoUpdateIntervalHour
	if hours <= 0 {
		hours = 12
	}
	return time.Duration(hours) * time.Hour
}

func (g *Gateway) refreshAllProfiles(ctx context.Context) {
	g.profilesMu.Lock()
	ids := make([]string, 0, len(g.profiles))
	for _, profile := range g.profiles {
		ids = append(ids, profile.ID)
	}
	g.profilesMu.Unlock()
	if len(ids) == 0 {
		return
	}

	for _, id := range ids {
		if err := g.RefreshProfile(ctx, id); err != nil {
			g.log("warn", "定时更新订阅失败："+err.Error())
		}
	}
	// Lets an open profiles page repaint without polling.
	if list, err := g.Profiles(ctx); err == nil {
		g.emit("gateway:profiles", list)
	}
	if g.Settings().AutoSwitchLowest {
		g.selectLowestLatency(ctx)
	}
}

// selectLowestLatency implements "订阅更新后自动切到延迟最低节点". It reads the
// kernel's own delay history instead of re-probing, so a scheduled refresh
// does not turn into a burst of 128 latency checks.
func (g *Gateway) selectLowestLatency(ctx context.Context) {
	proxies, err := g.client.Proxies(ctx)
	if err != nil {
		return
	}
	groupName, group, ok := mainGroup(proxies, g.Settings().Mode)
	if !ok {
		return
	}
	best, bestDelay := "", 0
	for _, name := range group.All {
		delay := lastDelay(proxies[name])
		if delay == nil {
			continue
		}
		if best == "" || *delay < bestDelay {
			best, bestDelay = name, *delay
		}
	}
	if best == "" || best == group.Now {
		return
	}
	if err := g.client.Select(ctx, groupName, best); err != nil {
		g.log("warn", "自动切换节点失败："+err.Error())
		return
	}
	g.log("info", fmt.Sprintf("订阅已更新，自动切到延迟最低节点：%s（%d ms）", best, bestDelay))
}

func (g *Gateway) countConnections(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		if raw, err := g.client.Connections(ctx); err == nil {
			g.connectionNo.Store(int64(len(raw)))
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// --- exit IP ---------------------------------------------------------------

// lookupExitThroughKernel queries the endpoint through the mixed port so the
// answer is the address the world sees, not the local one.
func (g *Gateway) lookupExitThroughKernel(ctx context.Context) (exitip.Info, error) {
	settings := g.Settings()
	client := exitip.New(settings.ExitIPEndpoint, fmt.Sprintf("127.0.0.1:%d", settings.MixedPort))
	return client.Lookup(ctx)
}

func (g *Gateway) refreshExit(ctx context.Context) {
	settings := g.Settings()
	if !settings.SystemProxy || strings.TrimSpace(settings.ExitIPEndpoint) == "" {
		g.setExit(exitip.Info{}, false)
		return
	}
	lookup := g.lookupExit
	if lookup == nil {
		lookup = g.lookupExitThroughKernel
	}
	info, err := lookup(ctx)
	if err != nil {
		g.setExit(exitip.Info{}, false)
		return
	}
	g.setExit(info, true)
}

func (g *Gateway) setExit(info exitip.Info, ok bool) {
	g.exitMu.Lock()
	defer g.exitMu.Unlock()
	g.exit, g.exitOK = info, ok
}

func (g *Gateway) exitSnapshot() (exitip.Info, bool) {
	g.exitMu.Lock()
	defer g.exitMu.Unlock()
	return g.exit, g.exitOK
}

// invalidateExit drops the cached answer (the exit just changed) and refills it
// in the background; the card shows — instead of a stale country meanwhile.
func (g *Gateway) invalidateExit() {
	g.setExit(exitip.Info{}, false)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		g.refreshExit(ctx)
	}()
}

// pumpExitIP refreshes the cached answer. A failed lookup retries quickly: at
// startup the kernel is often still booting, and waiting five minutes for the
// card to fill in would look broken.
func (g *Gateway) pumpExitIP(ctx context.Context) {
	timer := time.NewTimer(0)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			g.refreshExit(ctx)
			_, ok := g.exitSnapshot()
			timer.Reset(exitRefreshDelay(ok))
		}
	}
}

func exitRefreshDelay(ok bool) time.Duration {
	if ok {
		return 5 * time.Minute
	}
	return 30 * time.Second
}

// regionName maps ISO codes to the names the design uses. HK/MO/TW are written
// the way Chinese law requires; unlisted codes fall through as-is.
func regionName(code string) string {
	switch strings.ToUpper(code) {
	case "HK":
		return "中国香港"
	case "MO":
		return "中国澳门"
	case "TW":
		return "中国台湾"
	case "CN":
		return "中国大陆"
	case "JP":
		return "日本"
	case "SG":
		return "新加坡"
	case "KR":
		return "韩国"
	case "US":
		return "美国"
	case "GB", "UK":
		return "英国"
	case "DE":
		return "德国"
	case "FR":
		return "法国"
	case "CA":
		return "加拿大"
	case "AU":
		return "澳大利亚"
	case "NL":
		return "荷兰"
	case "RU":
		return "俄罗斯"
	case "IN":
		return "印度"
	case "TR":
		return "土耳其"
	case "MY":
		return "马来西亚"
	case "TH":
		return "泰国"
	case "VN":
		return "越南"
	case "PH":
		return "菲律宾"
	case "ID":
		return "印度尼西亚"
	case "AE":
		return "阿联酋"
	case "BR":
		return "巴西"
	}
	return strings.ToUpper(code)
}

// --- helpers ---------------------------------------------------------------

func (g *Gateway) emit(name string, payload any) {
	if g.app != nil {
		g.app.Event.Emit(name, payload)
	}
}

func (g *Gateway) log(level, message string) {
	g.emit("gateway:log", LogLine{Time: time.Now().Format("15:04:05.000"), Level: level, Message: message})
}

func (g *Gateway) updateSettings(mutate func(*Settings)) error {
	g.settingsMu.Lock()
	mutate(&g.settings)
	next := g.settings
	g.settingsMu.Unlock()
	return g.saveSettings(next)
}

func (g *Gateway) activeConfigPath() string {
	g.profilesMu.Lock()
	defer g.profilesMu.Unlock()
	for _, profile := range g.profiles {
		if profile.ID == g.activeID {
			return profile.File
		}
	}
	return ""
}

func (g *Gateway) fetchSubscription(ctx context.Context, rawURL string) ([]byte, http.Header, error) {
	transport := http.DefaultTransport
	if g.Settings().ProxyDownload {
		port := g.Settings().MixedPort
		transport = &http.Transport{Proxy: http.ProxyURL(&url.URL{Scheme: "http", Host: fmt.Sprintf("127.0.0.1:%d", port)})}
	}
	client := &http.Client{Timeout: 25 * time.Second, Transport: transport}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("User-Agent", "GoClash/3.0")
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("订阅地址返回 %s", resp.Status)
	}
	body := make([]byte, 0, 64*1024)
	buf := make([]byte, 32*1024)
	for {
		n, err := resp.Body.Read(buf)
		body = append(body, buf[:n]...)
		if err != nil {
			break
		}
		if len(body) > 8*1024*1024 {
			return nil, nil, errors.New("订阅内容超过 8MB，已中止")
		}
	}
	return body, resp.Header, nil
}

func (g *Gateway) loadSettings() Settings {
	settings := defaultSettings()
	raw, err := os.ReadFile(filepath.Join(g.dir, "settings.json"))
	if err == nil {
		_ = json.Unmarshal(raw, &settings)
	}
	if settings.ControllerAddr == "" {
		settings.ControllerAddr = "127.0.0.1:9090"
	}
	// Older builds stored the display name; settings written by hand may hold
	// garbage. Both normalise here so the UI only ever sees a locale code.
	switch settings.Language {
	case "zh-CN", "en-US":
	default:
		if strings.HasPrefix(strings.ToLower(settings.Language), "en") {
			settings.Language = "en-US"
		} else {
			settings.Language = "zh-CN"
		}
	}
	return settings
}

func (g *Gateway) saveSettings(settings Settings) error {
	raw, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(g.dir, "settings.json"), raw, 0o644)
}

type profilesFile struct {
	Active string    `json:"active"`
	Items  []Profile `json:"items"`
}

func (g *Gateway) loadProfiles() {
	raw, err := os.ReadFile(filepath.Join(g.dir, "profiles.json"))
	if err != nil {
		return
	}
	var stored profilesFile
	if json.Unmarshal(raw, &stored) != nil {
		return
	}
	g.profiles = stored.Items
	g.activeID = stored.Active
}

func (g *Gateway) saveProfiles() {
	g.profilesMu.Lock()
	stored := profilesFile{Active: g.activeID, Items: g.profiles}
	g.profilesMu.Unlock()
	if raw, err := json.MarshalIndent(stored, "", "  "); err == nil {
		_ = os.WriteFile(filepath.Join(g.dir, "profiles.json"), raw, 0o644)
	}
}

func defaultSettings() Settings {
	return Settings{
		SystemProxy:            true,
		MixedPort:              7890,
		Mode:                   "rule",
		LogLevel:               "info",
		AutoUpdateEnabled:      true,
		AutoUpdateIntervalHour: 12,
		AutoSwitchLowest:       true,
		LaunchAtLogin:          true,
		CloseAction:            "tray",
		Channel:                "stable",
		Language:               "zh-CN",
		Theme:                  "light",
		Accent:                 "coral",
		MenuBarLatency:         true,
		ControllerAddr:         "127.0.0.1:9090",
		ExitIPEndpoint:         "https://api.ip.sb/geoip",
	}
}

func strategyOf(proxyType string) (string, bool) {
	switch proxyType {
	case "Selector":
		return "select", true
	case "URLTest":
		return "url-test", true
	case "Fallback":
		return "fallback", true
	case "LoadBalance":
		return "load-balance", true
	case "Relay":
		return "relay", true
	}
	return "", false
}

func lastDelay(proxy mihomo.Proxy) *int {
	if len(proxy.History) == 0 {
		return nil
	}
	delay := proxy.History[len(proxy.History)-1].Delay
	if delay <= 0 {
		return nil
	}
	return &delay
}

func currentExit(proxies map[string]mihomo.Proxy, mode string) (string, *int) {
	if mode == "direct" {
		return "DIRECT", nil
	}
	_, group, ok := mainGroup(proxies, mode)
	if !ok {
		return "", nil
	}
	return group.Now, lastDelay(proxies[group.Now])
}

// mainGroup names the strategy group that carries regular traffic. The order
// differs by mode: rule mode goes through the selector, global through GLOBAL.
func mainGroup(proxies map[string]mihomo.Proxy, mode string) (string, mihomo.Proxy, bool) {
	candidates := []string{"GLOBAL", "节点选择", "PROXY", "Proxy"}
	if mode == "rule" {
		candidates = []string{"节点选择", "PROXY", "Proxy", "GLOBAL"}
	}
	for _, name := range candidates {
		if proxy, ok := proxies[name]; ok && proxy.Now != "" {
			return name, proxy, true
		}
	}
	names := make([]string, 0, len(proxies))
	for name, proxy := range proxies {
		if _, isGroup := strategyOf(proxy.Type); isGroup && proxy.Now != "" {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	if len(names) == 0 {
		return "", mihomo.Proxy{}, false
	}
	return names[0], proxies[names[0]], true
}

// relativeTime turns the stored timestamp into the label the cards show. It is
// computed on read so a page opened hours later never repeats 刚刚.
func relativeTime(unix int64) string {
	if unix <= 0 {
		return ""
	}
	elapsed := time.Since(time.Unix(unix, 0))
	switch {
	case elapsed < time.Minute:
		return "刚刚"
	case elapsed < time.Hour:
		return fmt.Sprintf("%d 分钟前", int(elapsed.Minutes()))
	case elapsed < 24*time.Hour:
		return fmt.Sprintf("%d 小时前", int(elapsed.Hours()))
	case elapsed < 48*time.Hour:
		return "昨天"
	default:
		return fmt.Sprintf("%d 天前", int(elapsed.Hours()/24))
	}
}

func countNodes(proxies map[string]mihomo.Proxy) int {
	count := 0
	for _, proxy := range proxies {
		if _, isGroup := strategyOf(proxy.Type); isGroup {
			continue
		}
		if isBuiltIn(proxy.Type) {
			continue
		}
		count++
	}
	return count
}

func isBuiltIn(proxyType string) bool {
	switch proxyType {
	case "Direct", "Reject", "RejectDrop", "Compatible", "Pass", "Dns":
		return true
	}
	return false
}

func isReject(exit string, conn mihomo.Connection) bool {
	if strings.EqualFold(exit, "REJECT") {
		return true
	}
	rule := conn.Rule + " " + conn.RulePay
	return strings.Contains(strings.ToLower(rule), "reject")
}

func probe(ctx context.Context, client *mihomo.Client, nodes []string) {
	sem := make(chan struct{}, 6)
	var wg sync.WaitGroup
	for _, node := range nodes {
		wg.Add(1)
		go func(node string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			_, _ = client.Delay(ctx, node, "https://www.gstatic.com/generate_204", 3000)
		}(node)
	}
	wg.Wait()
}

func hostOf(conn mihomo.Connection) string {
	host := conn.Metadata.Host
	if host == "" {
		host = conn.Metadata.DestinationIP
	}
	if host == "" {
		host = "unknown"
	}
	if conn.Metadata.DestinationPort != "" {
		return host + ":" + conn.Metadata.DestinationPort
	}
	return host
}

func hostLabel(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		return "新订阅"
	}
	return parsed.Hostname()
}

// maskURL keeps the scheme+host and the first characters of the token so card
// copy matches the board without exposing the full secret. Built by hand so the
// ellipsis stays literal instead of being percent-encoded.
func maskURL(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	display := parsed.Scheme + "://" + parsed.Host + parsed.Path
	switch token := parsed.Query().Get("token"); {
	case token != "":
		if len(token) > 4 {
			token = token[:4]
		}
		display += "?token=" + token + "…"
	case parsed.RawQuery != "":
		display += "?" + parsed.RawQuery
	}
	return display
}

func countProxies(body []byte) int {
	var doc struct {
		Proxies []map[string]any `yaml:"proxies"`
	}
	if yaml.Unmarshal(body, &doc) != nil {
		return 0
	}
	return len(doc.Proxies)
}

// parseUserInfo reads the subscription-userinfo header:
// "upload=1; download=2; total=3; expire=1700000000".
func parseUserInfo(header http.Header) (int64, int64, string) {
	value := header.Get("subscription-userinfo")
	if value == "" {
		return 0, 0, "未知"
	}
	var upload, download, total, expire int64 = 0, 0, 0, 0
	for _, part := range strings.Split(value, ";") {
		keyValue := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(keyValue) != 2 {
			continue
		}
		number, _ := strconv.ParseInt(keyValue[1], 10, 64)
		switch keyValue[0] {
		case "upload":
			upload = number
		case "download":
			download = number
		case "total":
			total = number
		case "expire":
			expire = number
		}
	}
	expires := "未知"
	if expire > 0 {
		expires = time.Unix(expire, 0).Format("2006-01-02")
	}
	return upload + download, total, expires
}

func openDirectory(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", path)
	case "windows":
		cmd = exec.Command("explorer", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	return cmd.Start()
}

func sleepCtx(ctx context.Context, d time.Duration) {
	select {
	case <-ctx.Done():
	case <-time.After(d):
	}
}
