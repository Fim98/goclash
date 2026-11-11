package main

import (
	"os/exec"
	"sync"
)

// CoreProcess supervises a mihomo binary the user points at. v1 does not embed
// a core; if settings.corePath is empty the gateway reports that restarting is
// unavailable instead of pretending.
type CoreProcess struct {
	bin    string
	dir    string
	config string

	mu  sync.Mutex
	cmd *exec.Cmd
}

func (p *CoreProcess) Start() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cmd != nil {
		return nil
	}

	args := []string{"-d", p.dir}
	if p.config != "" {
		args = append(args, "-f", p.config)
	}
	cmd := exec.Command(p.bin, args...)
	if err := cmd.Start(); err != nil {
		return err
	}
	p.cmd = cmd

	go func() {
		_ = cmd.Wait()
		p.mu.Lock()
		if p.cmd == cmd {
			p.cmd = nil
		}
		p.mu.Unlock()
	}()
	return nil
}

func (p *CoreProcess) Stop() {
	p.mu.Lock()
	cmd := p.cmd
	p.cmd = nil
	p.mu.Unlock()
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}

func (p *CoreProcess) Restart() error {
	p.Stop()
	return p.Start()
}
