package service

import (
	"context"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func sampleConfig() Config {
	return Config{
		CorePath:   "/usr/local/bin/mihomo",
		ConfigDir:  "/Users/me/Library/Application Support/GoClash",
		ConfigFile: "/Users/me/Library/Application Support/GoClash/profiles/p1.yaml",
		LogPath:    "/Users/me/Library/Application Support/GoClash/logs/core.log",
	}
}

func TestPlistCarriesTheKernelArguments(t *testing.T) {
	got := plist(sampleConfig())

	for _, want := range []string{
		"<string>com.goclash.core</string>",
		"<string>/usr/local/bin/mihomo</string>",
		"<string>-d</string>",
		"<string>/Users/me/Library/Application Support/GoClash</string>",
		"<string>-f</string>",
		"<string>/Users/me/Library/Application Support/GoClash/profiles/p1.yaml</string>",
		"<key>KeepAlive</key>\n\t<true/>",
		"<key>StandardErrorPath</key>\n\t<string>/Users/me/Library/Application Support/GoClash/logs/core.log</string>",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in\n%s", want, got)
		}
	}
}

func TestPlistEscapesPaths(t *testing.T) {
	cfg := sampleConfig()
	cfg.ConfigDir = "/tmp/a&b<c"
	got := plist(cfg)

	if strings.Contains(got, "a&b<c") {
		t.Fatalf("raw XML special characters leaked:\n%s", got)
	}
	if !strings.Contains(got, "/tmp/a&amp;b&lt;c") {
		t.Fatalf("expected escaped path:\n%s", got)
	}
}

func TestInstallScriptWritesThePlistFromBase64(t *testing.T) {
	cfg := sampleConfig()
	script := installScript(cfg)

	if !strings.Contains(script, "/bin/launchctl bootstrap system '"+PlistPath+"'") {
		t.Fatalf("bootstrap step missing:\n%s", script)
	}
	if !strings.Contains(script, "/usr/sbin/chown root:wheel") {
		t.Fatalf("ownership step missing:\n%s", script)
	}

	// The payload must decode back to the exact plist.
	payload := between(script, "/usr/bin/printf %s '", "' | /usr/bin/base64 -D")
	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		t.Fatalf("payload is not base64: %v", err)
	}
	if string(decoded) != plist(cfg) {
		t.Fatalf("payload does not match the plist")
	}
}

func TestUninstallAndKickstartScripts(t *testing.T) {
	uninstall := uninstallScript()
	if !strings.Contains(uninstall, "launchctl bootout system/"+Label) || !strings.Contains(uninstall, "/bin/rm -f '"+PlistPath+"'") {
		t.Fatalf("uninstall = %s", uninstall)
	}
	if kick := kickstartScript(); !strings.Contains(kick, "kickstart -k system/"+Label) {
		t.Fatalf("kickstart = %s", kick)
	}
}

func TestShellAndAppleScriptQuoting(t *testing.T) {
	if got := shellQuote("a'b"); got != `'a'\''b'` {
		t.Fatalf("shellQuote = %s", got)
	}
	if got := appleScriptQuote(`say "hi"\now`); got != `"say \"hi\"\\now"` {
		t.Fatalf("appleScriptQuote = %s", got)
	}
}

func TestInstallRejectsIncompleteConfig(t *testing.T) {
	manager := NewWithRunner(func(context.Context, string, ...string) ([]byte, error) {
		t.Fatal("no command should run for an invalid config")
		return nil, nil
	})

	missingCore := sampleConfig()
	missingCore.CorePath = ""
	if err := manager.Install(context.Background(), missingCore); err == nil {
		t.Fatal("expected an error without a core path")
	}

	missingProfile := sampleConfig()
	missingProfile.ConfigFile = ""
	if err := manager.Install(context.Background(), missingProfile); err == nil {
		t.Fatal("expected an error without a profile")
	}

	notExecutable := sampleConfig()
	notExecutable.CorePath = filepath.Join(t.TempDir(), "missing-mihomo")
	if err := manager.Install(context.Background(), notExecutable); err == nil {
		t.Fatal("expected an error for a missing binary")
	}
}

func TestInstallPromptsOnceWithAdminPrivileges(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("launchd is macOS only")
	}
	cfg := sampleConfig()
	if err := os.WriteFile(cfg.CorePath, []byte("#!/bin/sh\n"), 0o755); err != nil {
		// /usr/local/bin may not be writable; use a temp binary instead.
		cfg.CorePath = filepath.Join(t.TempDir(), "mihomo")
		if err := os.WriteFile(cfg.CorePath, []byte("#!/bin/sh\n"), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	var calls [][]string
	manager := NewWithRunner(func(_ context.Context, name string, args ...string) ([]byte, error) {
		calls = append(calls, append([]string{name}, args...))
		return nil, nil
	})
	if err := manager.Install(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}

	if len(calls) != 1 || calls[0][0] != "/usr/bin/osascript" {
		t.Fatalf("calls = %v", calls)
	}
	script := strings.Join(calls[0], " ")
	if !strings.Contains(script, "with administrator privileges") {
		t.Fatalf("not privileged: %s", script)
	}
}

func TestUninstallReportsACanceledPrompt(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("osascript is macOS only")
	}
	manager := NewWithRunner(func(context.Context, string, ...string) ([]byte, error) {
		return []byte("execution error: User canceled. (-128)"), errors.New("exit status 1")
	})
	err := manager.Uninstall(context.Background())
	if err == nil || !strings.Contains(err.Error(), "已取消") {
		t.Fatalf("err = %v", err)
	}
}

func TestStatusClassifiesPlistAndJob(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("launchctl is macOS only")
	}
	dir := t.TempDir()
	plistFile := filepath.Join(dir, "com.goclash.core.plist")
	manager := NewWithRunner(func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name == "/bin/launchctl" && args[0] == "print" {
			return nil, errors.New("Could not find service")
		}
		return nil, nil
	})
	manager.plistPath = plistFile

	state, err := manager.Status(context.Background())
	if err != nil || state != StateMissing {
		t.Fatalf("missing = %q, %v", state, err)
	}

	if err := os.WriteFile(plistFile, []byte("<plist/>"), 0o644); err != nil {
		t.Fatal(err)
	}
	state, _ = manager.Status(context.Background())
	if state != StateInstalled {
		t.Fatalf("installed = %q", state)
	}

	manager.run = func(context.Context, string, ...string) ([]byte, error) { return nil, nil }
	state, _ = manager.Status(context.Background())
	if state != StateRunning {
		t.Fatalf("running = %q", state)
	}
}

func between(value, start, end string) string {
	_, after, found := strings.Cut(value, start)
	if !found {
		return ""
	}
	before, _, found := strings.Cut(after, end)
	if !found {
		return ""
	}
	return before
}
