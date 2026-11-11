package corefetch

import (
	"context"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"testing"
	"time"
)

// TestLiveDownload walks the whole pipeline against the real release feed:
// resolve, pick the platform asset, download, unpack, and execute the result.
// It is skipped by default because it moves ~20MB over the network.
//
//	GOCLASH_LIVE_CORE=1 go test ./internal/corefetch -run Live -v
func TestLiveDownload(t *testing.T) {
	if os.Getenv("GOCLASH_LIVE_CORE") != "1" {
		t.Skip("设置 GOCLASH_LIVE_CORE=1 才跑真实下载")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	client := New(&http.Client{Timeout: 5 * time.Minute})
	release, err := client.Latest(ctx, "stable")
	if err != nil {
		t.Fatalf("Latest: %v", err)
	}
	t.Logf("最新版本：%s（%d 个资产）", release.Version, len(release.Assets))

	asset, err := Pick(release, runtime.GOOS, runtime.GOARCH)
	if err != nil {
		t.Fatalf("Pick: %v", err)
	}
	t.Logf("选中：%s（%.1f MB）", asset.Name, float64(asset.Size)/(1<<20))

	var last int64
	path, err := client.Install(ctx, asset, release.Version, t.TempDir(), func(received, total int64) {
		if total > 0 && received-last > total/4 {
			last = received
			t.Logf("  %d%%", received*100/total)
		}
	})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	t.Logf("已安装：%s（%.1f MB，模式 %v）", path, float64(info.Size())/(1<<20), info.Mode())

	out, err := exec.Command(path, "-v").CombinedOutput()
	if err != nil {
		t.Fatalf("内核无法运行：%v\n%s", err, out)
	}
	version := strings.TrimSpace(string(out))
	t.Logf("内核自报：%s", version)
	if !strings.Contains(version, strings.TrimPrefix(release.Version, "v")) {
		t.Errorf("内核版本 %q 与发布版本 %q 不一致", version, release.Version)
	}
}
