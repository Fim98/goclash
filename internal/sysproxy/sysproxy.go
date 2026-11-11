// Package sysproxy flips the operating system's own proxy settings so traffic
// actually reaches the kernel. Without this the toggle only moves a boolean.
//
// The platform wiring is thin; the command sequences live in plan.go as pure
// data so they can be asserted on any OS.
package sysproxy

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// Runner executes one command and returns its combined output. Tests inject a
// recorder; production uses the real process.
type Runner func(ctx context.Context, name string, args ...string) ([]byte, error)

// Manager applies and clears the system proxy for the active network service.
type Manager struct {
	run Runner
}

func New() *Manager {
	return &Manager{run: execRunner}
}

// NewWithRunner is the test seam.
func NewWithRunner(run Runner) *Manager {
	return &Manager{run: run}
}

func execRunner(ctx context.Context, name string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, name, args...).CombinedOutput()
}

// Enable points the OS proxy at the kernel's mixed port.
func (m *Manager) Enable(ctx context.Context, port int) error {
	if port <= 0 || port > 65535 {
		return fmt.Errorf("混合端口无效：%d", port)
	}
	return platformEnable(ctx, m, port)
}

// Disable restores direct access. Quitting calls this so the machine never
// points at a proxy that has already exited.
func (m *Manager) Disable(ctx context.Context) error {
	return platformDisable(ctx, m)
}

func (m *Manager) runStep(ctx context.Context, s step) error {
	out, err := m.run(ctx, s.name, s.args...)
	if err != nil {
		if detail := strings.TrimSpace(string(out)); detail != "" {
			return fmt.Errorf("%s %s 失败：%w（%s）", s.name, strings.Join(s.args, " "), err, detail)
		}
		return fmt.Errorf("%s %s 失败：%w", s.name, strings.Join(s.args, " "), err)
	}
	return nil
}
