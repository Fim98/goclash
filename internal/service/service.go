// Package service installs the core as a privileged launchd daemon, which is
// the only way mihomo can create a TUN device.
//
// Everything here is macOS-only on purpose: a Linux systemd unit and a Windows
// service have different shapes, and shipping untested privileged plumbing for
// them would be worse than saying "not supported yet".
package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// Label is the launchd job identifier.
const Label = "com.goclash.core"

// PlistPath is where launchd expects system daemons.
const PlistPath = "/Library/LaunchDaemons/" + Label + ".plist"

// ErrUnsupported is returned on platforms without an implementation.
var ErrUnsupported = errors.New("当前系统不支持安装系统服务（目前只有 macOS）")

// State is what the UI shows next to the TUN switch.
type State string

const (
	StateMissing     State = "missing"
	StateInstalled   State = "installed"
	StateRunning     State = "running"
	StateUnsupported State = "unsupported"
)

// Config is everything the daemon needs to launch the core.
type Config struct {
	CorePath   string
	ConfigDir  string
	ConfigFile string
	LogPath    string
}

// Runner executes one command; tests inject a recorder.
type Runner func(ctx context.Context, name string, args ...string) ([]byte, error)

type Manager struct {
	run       Runner
	plistPath string
}

func New() *Manager {
	return &Manager{run: execRunner, plistPath: PlistPath}
}

// NewWithRunner is the test seam.
func NewWithRunner(run Runner) *Manager {
	return &Manager{run: run, plistPath: PlistPath}
}

func execRunner(ctx context.Context, name string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, name, args...).CombinedOutput()
}

// Status inspects the plist and the loaded job. It never prompts.
func (m *Manager) Status(ctx context.Context) (State, error) {
	if runtime.GOOS != "darwin" {
		return StateUnsupported, nil
	}
	if _, err := os.Stat(m.plistPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return StateMissing, nil
		}
		return StateMissing, err
	}
	if _, err := m.run(ctx, "/bin/launchctl", "print", "system/"+Label); err != nil {
		// Installed but not loaded: the plist is there, launchd is not running it.
		return StateInstalled, nil
	}
	return StateRunning, nil
}

// Install writes the plist and boots the daemon. The privileged part runs
// through one admin prompt.
func (m *Manager) Install(ctx context.Context, cfg Config) error {
	if runtime.GOOS != "darwin" {
		return ErrUnsupported
	}
	if err := validate(cfg); err != nil {
		return err
	}
	return m.runAdmin(ctx, installScript(cfg))
}

// Uninstall boots the daemon out and removes the plist.
func (m *Manager) Uninstall(ctx context.Context) error {
	if runtime.GOOS != "darwin" {
		return ErrUnsupported
	}
	return m.runAdmin(ctx, uninstallScript())
}

// Kickstart restarts the running daemon through launchd.
func (m *Manager) Kickstart(ctx context.Context) error {
	if runtime.GOOS != "darwin" {
		return ErrUnsupported
	}
	return m.runAdmin(ctx, kickstartScript())
}

func (m *Manager) runAdmin(ctx context.Context, script string) error {
	out, err := m.run(ctx, "/usr/bin/osascript", "-e", "do shell script "+appleScriptQuote(script)+" with administrator privileges")
	if err != nil {
		detail := strings.TrimSpace(string(out))
		if strings.Contains(detail, "User canceled") || strings.Contains(detail, "-128") {
			return errors.New("已取消管理员授权")
		}
		if detail != "" {
			return fmt.Errorf("安装系统服务失败：%w（%s）", err, detail)
		}
		return fmt.Errorf("安装系统服务失败：%w", err)
	}
	return nil
}

func validate(cfg Config) error {
	if !filepath.IsAbs(cfg.CorePath) {
		return errors.New("尚未配置内核路径：在 settings.json 里设置 corePath")
	}
	if info, err := os.Stat(cfg.CorePath); err != nil || info.IsDir() {
		return fmt.Errorf("内核程序不可用：%s", cfg.CorePath)
	}
	if cfg.ConfigFile == "" {
		return errors.New("还没有可用的配置文件：先导入一个订阅")
	}
	if !filepath.IsAbs(cfg.ConfigDir) || !filepath.IsAbs(cfg.ConfigFile) {
		return errors.New("配置目录必须是绝对路径")
	}
	return nil
}

// plist renders the launchd property list. Kept pure so its content can be
// asserted on any platform.
func plist(cfg Config) string {
	args := []string{cfg.CorePath, "-d", cfg.ConfigDir}
	if cfg.ConfigFile != "" {
		args = append(args, "-f", cfg.ConfigFile)
	}
	var builder strings.Builder
	builder.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	builder.WriteString(`<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">` + "\n")
	builder.WriteString("<plist version=\"1.0\">\n<dict>\n")
	builder.WriteString("\t<key>Label</key>\n\t<string>" + xmlEscape(Label) + "</string>\n")
	builder.WriteString("\t<key>ProgramArguments</key>\n\t<array>\n")
	for _, arg := range args {
		builder.WriteString("\t\t<string>" + xmlEscape(arg) + "</string>\n")
	}
	builder.WriteString("\t</array>\n")
	builder.WriteString("\t<key>RunAtLoad</key>\n\t<true/>\n")
	builder.WriteString("\t<key>KeepAlive</key>\n\t<true/>\n")
	builder.WriteString("\t<key>ProcessType</key>\n\t<string>Background</string>\n")
	builder.WriteString("\t<key>StandardOutPath</key>\n\t<string>" + xmlEscape(cfg.LogPath) + "</string>\n")
	builder.WriteString("\t<key>StandardErrorPath</key>\n\t<string>" + xmlEscape(cfg.LogPath) + "</string>\n")
	builder.WriteString("</dict>\n</plist>\n")
	return builder.String()
}

// installScript is the shell the admin prompt runs: it writes the plist from a
// base64 payload (no temp file, no quoting hazards) and boots the daemon.
func installScript(cfg Config) string {
	payload := base64.StdEncoding.EncodeToString([]byte(plist(cfg)))
	steps := []string{
		"set -e",
		"/bin/mkdir -p " + shellQuote(filepath.Dir(cfg.LogPath)),
		"/usr/bin/printf %s " + shellQuote(payload) + " | /usr/bin/base64 -D > " + shellQuote(PlistPath),
		"/usr/sbin/chown root:wheel " + shellQuote(PlistPath),
		"/bin/chmod 644 " + shellQuote(PlistPath),
		// bootout fails when nothing is loaded; that is not an error here.
		"/bin/launchctl bootout system/" + Label + " >/dev/null 2>&1 || true",
		"/bin/launchctl bootstrap system " + shellQuote(PlistPath),
	}
	return strings.Join(steps, "; ")
}

func uninstallScript() string {
	return strings.Join([]string{
		"set -e",
		"/bin/launchctl bootout system/" + Label + " >/dev/null 2>&1 || true",
		"/bin/rm -f " + shellQuote(PlistPath),
	}, "; ")
}

func kickstartScript() string {
	return "set -e; /bin/launchctl kickstart -k system/" + Label
}

// shellQuote wraps a value in single quotes, escaping embedded ones.
func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}

// appleScriptQuote wraps the shell string in an AppleScript literal.
func appleScriptQuote(script string) string {
	escaped := strings.ReplaceAll(script, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `"`, `\"`)
	return `"` + escaped + `"`
}

func xmlEscape(value string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(value)
}
