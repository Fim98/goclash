package corefetch

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// realRelease is the shape GitHub returns, trimmed to the fields we read. The
// asset names are copied from an actual mihomo release listing.
const realRelease = `{
  "tag_name": "v1.19.2",
  "prerelease": false,
  "assets": [
    {"name": "mihomo-android-arm64-v8a-v1.19.2.gz", "browser_download_url": "https://example.test/android.gz", "size": 9},
    {"name": "mihomo-darwin-amd64-compatible-v1.19.2.gz", "browser_download_url": "https://example.test/darwin-compat.gz", "size": 9},
    {"name": "mihomo-darwin-amd64-v1.19.2.gz", "browser_download_url": "https://example.test/darwin-amd64.gz", "size": 9},
    {"name": "mihomo-darwin-arm64-v1.19.2.gz", "browser_download_url": "https://example.test/darwin-arm64.gz", "size": 9},
    {"name": "mihomo-linux-amd64-go120-v1.19.2.gz", "browser_download_url": "https://example.test/linux-go120.gz", "size": 9},
    {"name": "mihomo-linux-amd64-v1.19.2.gz", "browser_download_url": "https://example.test/linux-amd64.gz", "size": 9},
    {"name": "mihomo-windows-amd64-v1.19.2.zip", "browser_download_url": "https://example.test/windows.zip", "size": 9},
    {"name": "mihomo-darwin-arm64-v1.19.2.gz.sha256", "browser_download_url": "https://example.test/sum", "size": 9}
  ]
}`

func decodeRelease(t *testing.T, raw string) Release {
	t.Helper()
	var release Release
	if err := json.Unmarshal([]byte(raw), &release); err != nil {
		t.Fatalf("release payload: %v", err)
	}
	return release
}

func TestPickChoosesThePlatformBuild(t *testing.T) {
	release := decodeRelease(t, realRelease)

	cases := []struct {
		goos, goarch string
		want         string
	}{
		{"darwin", "arm64", "mihomo-darwin-arm64-v1.19.2.gz"},
		// The compatible build sorts first alphabetically but is the slow
		// fallback; the plain one has to win.
		{"darwin", "amd64", "mihomo-darwin-amd64-v1.19.2.gz"},
		// "-go120" variants share the arch segment; shortest name wins.
		{"linux", "amd64", "mihomo-linux-amd64-v1.19.2.gz"},
	}
	for _, tc := range cases {
		asset, err := Pick(release, tc.goos, tc.goarch)
		if err != nil {
			t.Fatalf("%s/%s: %v", tc.goos, tc.goarch, err)
		}
		if asset.Name != tc.want {
			t.Errorf("%s/%s picked %q, want %q", tc.goos, tc.goarch, asset.Name, tc.want)
		}
	}
}

func TestPickRejectsPlatformsWithoutAGzip(t *testing.T) {
	release := decodeRelease(t, realRelease)

	// Windows ships a zip, and armv7 has no darwin build at all: both must be
	// reported instead of installing something that cannot run.
	for _, tc := range []struct{ goos, goarch string }{
		{"windows", "amd64"},
		{"darwin", "386"},
	} {
		if _, err := Pick(release, tc.goos, tc.goarch); !errors.Is(err, ErrPlatform) {
			t.Errorf("%s/%s: err = %v, want ErrPlatform", tc.goos, tc.goarch, err)
		}
	}
}

func TestLatestStableHitsTheLatestEndpoint(t *testing.T) {
	var path string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		_, _ = w.Write([]byte(realRelease))
	}))
	defer srv.Close()

	release, err := NewAt(srv.Client(), srv.URL).Latest(context.Background(), "stable")
	if err != nil {
		t.Fatalf("Latest: %v", err)
	}
	if release.Version != "v1.19.2" {
		t.Errorf("version = %q", release.Version)
	}
	if len(release.Assets) != 8 {
		t.Errorf("assets = %d, want 8", len(release.Assets))
	}
	if path != "/repos/MetaCubeX/mihomo/releases/latest" {
		t.Errorf("path = %q", path)
	}
}

func TestLatestBetaReadsTheReleaseList(t *testing.T) {
	var query string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query = r.URL.RawQuery
		_, _ = w.Write([]byte(`[{"tag_name":"v1.20.0-beta.1","prerelease":true,"assets":[]}]`))
	}))
	defer srv.Close()

	release, err := NewAt(srv.Client(), srv.URL).Latest(context.Background(), "beta")
	if err != nil {
		t.Fatalf("Latest: %v", err)
	}
	if release.Version != "v1.20.0-beta.1" {
		t.Errorf("version = %q", release.Version)
	}
	if query != "per_page=1" {
		t.Errorf("query = %q", query)
	}
}

func TestLatestSurfacesAnHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "rate limited", http.StatusForbidden)
	}))
	defer srv.Close()

	_, err := NewAt(srv.Client(), srv.URL).Latest(context.Background(), "stable")
	if err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("err = %v, want a 403", err)
	}
}

func gzipBytes(t *testing.T, payload string) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := gzip.NewWriter(&buf)
	if _, err := writer.Write([]byte(payload)); err != nil {
		t.Fatalf("gzip: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("gzip: %v", err)
	}
	return buf.Bytes()
}

func TestInstallWritesAnExecutable(t *testing.T) {
	binary := "#!/bin/sh\necho mihomo\n"
	packed := gzipBytes(t, binary)

	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		_, _ = w.Write(packed)
	}))
	defer srv.Close()

	root := t.TempDir()
	var reports []int64
	path, err := NewAt(srv.Client(), srv.URL).Install(
		context.Background(),
		Asset{Name: "mihomo-darwin-arm64-v1.19.2.gz", URL: srv.URL + "/core.gz", Size: int64(len(packed))},
		"v1.19.2", root,
		func(received, _ int64) { reports = append(reports, received) },
	)
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if hits != 1 {
		t.Errorf("downloads = %d, want 1", hits)
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(got) != binary {
		t.Errorf("binary = %q", got)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		t.Errorf("mode = %v, want executable", info.Mode())
	}
	// The last report must land on the compressed size, i.e. 100% of the bar.
	// Reporting the uncompressed total would jump to 100% in the first second.
	if len(reports) == 0 || reports[len(reports)-1] != int64(len(packed)) {
		t.Errorf("progress reports = %v, want a final %d", reports, len(packed))
	}

	// No leftover .download-* temp files.
	entries, _ := os.ReadDir(filepath.Dir(path))
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".download-") {
			t.Errorf("temp file left behind: %s", entry.Name())
		}
	}
}

func TestInstallSurfacesADownloadFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "gone", http.StatusNotFound)
	}))
	defer srv.Close()

	_, err := NewAt(srv.Client(), srv.URL).Install(
		context.Background(),
		Asset{Name: "mihomo-darwin-arm64-v1.19.2.gz", URL: srv.URL + "/core.gz"},
		"v1.19.2", t.TempDir(), nil,
	)
	if err == nil || !strings.Contains(err.Error(), "404") {
		t.Fatalf("err = %v, want a 404", err)
	}
}

func TestInstalledListsTheNewestFirst(t *testing.T) {
	root := t.TempDir()
	name := "mihomo"
	if runtime.GOOS == "windows" {
		name = "mihomo.exe"
	}
	old, err := filepath.Abs(filepath.Join(root, "cores", "v1.18.0"))
	if err != nil {
		t.Fatal(err)
	}
	fresh, _ := filepath.Abs(filepath.Join(root, "cores", "v1.19.2"))
	for _, dir := range []string{old, fresh} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, name), []byte("bin"), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	// Make the older one unambiguously older.
	stamp := time.Now().Add(-48 * time.Hour)
	if err := os.Chtimes(filepath.Join(old, name), stamp, stamp); err != nil {
		t.Fatal(err)
	}

	cores := Installed(root)
	if len(cores) != 2 {
		t.Fatalf("cores = %d, want 2", len(cores))
	}
	if cores[0].Version != "1.19.2" {
		t.Errorf("first version = %q, want 1.19.2", cores[0].Version)
	}
	if !strings.HasSuffix(cores[0].Path, filepath.Join("cores", "v1.19.2", name)) {
		t.Errorf("path = %q", cores[0].Path)
	}
}

func TestInstalledIgnoresEmptyDirectories(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "cores", "v1.19.2"), 0o755); err != nil {
		t.Fatal(err)
	}
	if cores := Installed(root); len(cores) != 0 {
		t.Fatalf("cores = %v, want none", cores)
	}
	if cores := Installed(t.TempDir()); cores != nil {
		t.Fatalf("cores = %v, want nil for a missing directory", cores)
	}
}
