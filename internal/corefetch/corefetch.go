// Package corefetch downloads the mihomo (Clash Meta) core binary.
//
// GoClash ships no kernel. A fresh install has nothing to run, and "point
// settings.json at a binary you built yourself" is not an onboarding flow — so
// this package fetches the official release, verifies it looks like the platform
// build we expect, and installs it where the gateway can start it.
//
// Only the release metadata and the platform asset come from GitHub; everything
// else (selection, extraction, placement) is local and testable without the
// network.
package corefetch

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

// Repo is the upstream project that publishes the core.
const Repo = "MetaCubeX/mihomo"

// APIBase is the GitHub API root; NewAt overrides it in tests.
const APIBase = "https://api.github.com"

// MaxBytes caps the extracted binary. The real one is ~30MB; anything past this
// means the asset is not what we think it is.
const MaxBytes = 128 << 20

// ErrPlatform is returned when the release has no asset for this machine.
var ErrPlatform = errors.New("上游没有为当前系统发布内核包")

// Asset is one downloadable file attached to a release.
type Asset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
	Size int64  `json:"size"`
}

// Release is the subset of the GitHub release payload we consume.
type Release struct {
	Version string  `json:"tag_name"`
	Assets  []Asset `json:"assets"`
}

// ProgressFunc reports extraction progress. total is the compressed asset size
// when the release metadata carries it, otherwise 0.
type ProgressFunc func(received, total int64)

// Client talks to the release API and writes binaries to disk.
type Client struct {
	http *http.Client
	base string
}

// New builds a client on top of the given HTTP client, so the caller decides
// whether traffic goes direct or through the user's proxy.
func New(client *http.Client) *Client {
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}
	return &Client{http: client, base: APIBase}
}

// NewAt points the client at another API root; the test seam.
func NewAt(client *http.Client, base string) *Client {
	c := New(client)
	c.base = strings.TrimSuffix(base, "/")
	return c
}

// Latest resolves the release for a channel: "stable" ignores prereleases,
// anything else ("beta") takes the newest published release including them.
func (c *Client) Latest(ctx context.Context, channel string) (Release, error) {
	url := c.base + "/repos/" + Repo + "/releases/latest"
	listForm := false
	if channel == "beta" {
		url = c.base + "/repos/" + Repo + "/releases?per_page=1"
		listForm = true
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Release{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "GoClash/3.0")

	resp, err := c.http.Do(req)
	if err != nil {
		return Release{}, fmt.Errorf("无法连接 GitHub：%w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Release{}, fmt.Errorf("查询内核版本失败：%s", resp.Status)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return Release{}, err
	}

	if !listForm {
		var release Release
		if err := json.Unmarshal(body, &release); err != nil {
			return Release{}, err
		}
		if release.Version == "" {
			return Release{}, errors.New("上游返回的版本信息为空")
		}
		return release, nil
	}

	var releases []Release
	if err := json.Unmarshal(body, &releases); err != nil {
		return Release{}, err
	}
	if len(releases) == 0 || releases[0].Version == "" {
		return Release{}, errors.New("上游没有可用的发布版本")
	}
	return releases[0], nil
}

// Pick chooses the asset for a platform. Compatible builds are skipped: they are
// the older-CPU fallback, and picking one silently would cost performance.
func Pick(release Release, goos, goarch string) (Asset, error) {
	needle := "-" + goos + "-" + goarch + "-"
	var found []Asset
	for _, asset := range release.Assets {
		name := asset.Name
		if !strings.HasSuffix(name, ".gz") || strings.Contains(name, "compatible") {
			continue
		}
		if strings.Contains(name, needle) {
			found = append(found, asset)
		}
	}
	if len(found) == 0 {
		return Asset{}, fmt.Errorf("%w：%s/%s", ErrPlatform, goos, goarch)
	}
	// Variants such as "-go120" share the prefix; the shortest name is the
	// plain build, which is the one we want.
	sort.SliceStable(found, func(i, j int) bool { return len(found[i].Name) < len(found[j].Name) })
	return found[0], nil
}

// Install unpacks one asset into <root>/cores/<version>/ and returns the binary
// path. The executable bit is set before the file becomes visible under its
// final name, so a half-written binary is never startable.
func (c *Client) Install(ctx context.Context, asset Asset, version, root string, progress ProgressFunc) (string, error) {
	if version == "" {
		return "", errors.New("缺少内核版本号")
	}
	dir := filepath.Join(root, "cores", version)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}

	name := "mihomo"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	final := filepath.Join(dir, name)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, asset.URL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "GoClash/3.0")
	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("下载内核失败：%w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("下载内核失败：%s", resp.Status)
	}

	total := asset.Size
	if total <= 0 {
		total = resp.ContentLength
	}

	// Progress counts compressed bytes: the asset size is the compressed size,
	// and reporting the uncompressed total would race to 100% in the first
	// second of a 30MB unpack.
	download := &countingReader{reader: resp.Body}
	unpacked, err := gzip.NewReader(download)
	if err != nil {
		return "", fmt.Errorf("内核包无法解压：%w", err)
	}
	defer unpacked.Close()

	tmp, err := os.CreateTemp(dir, ".download-*")
	if err != nil {
		return "", err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op once the rename succeeds

	buf := make([]byte, 64<<10)
	var written int64
	lastReport := time.Now()
	for {
		n, readErr := unpacked.Read(buf)
		if n > 0 {
			if written+int64(n) > MaxBytes {
				_ = tmp.Close()
				return "", errors.New("内核体积超过上限，已中止")
			}
			if _, err := tmp.Write(buf[:n]); err != nil {
				_ = tmp.Close()
				return "", err
			}
			written += int64(n)
			if progress != nil && time.Since(lastReport) > 120*time.Millisecond {
				progress(download.count(), total)
				lastReport = time.Now()
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			_ = tmp.Close()
			return "", readErr
		}
	}

	if written == 0 {
		_ = tmp.Close()
		return "", errors.New("内核包是空的")
	}
	if err := tmp.Chmod(0o755); err != nil {
		_ = tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if progress != nil {
		// Land on 100% even when the last gzip block arrived in one read.
		if total <= 0 {
			total = download.count()
		}
		progress(total, total)
	}
	if err := os.Rename(tmpName, final); err != nil {
		return "", err
	}
	return final, nil
}

// Installed lists the cores already on disk, newest first. The gateway uses it
// to adopt a binary the user installed by hand or downloaded before settings
// were reset.
func Installed(root string) []InstalledCore {
	entries, err := os.ReadDir(filepath.Join(root, "cores"))
	if err != nil {
		return nil
	}
	name := "mihomo"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}

	var cores []InstalledCore
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		path := filepath.Join(root, "cores", entry.Name(), name)
		if stat, err := os.Stat(path); err != nil || stat.IsDir() {
			continue
		}
		cores = append(cores, InstalledCore{
			Version: strings.TrimPrefix(entry.Name(), "v"),
			Path:    path,
			ModTime: info.ModTime(),
		})
	}
	sort.SliceStable(cores, func(i, j int) bool { return cores[i].ModTime.After(cores[j].ModTime) })
	return cores
}

// InstalledCore is one binary found under <root>/cores.
type InstalledCore struct {
	Version string
	Path    string
	ModTime time.Time
}

// countingReader counts the bytes pulled off the wire. gzip reads ahead, so the
// count is approximate — but it is the right denominator for a progress bar.
type countingReader struct {
	reader io.Reader
	n      int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.reader.Read(p)
	c.n += int64(n)
	return n, err
}

func (c *countingReader) count() int64 { return c.n }
