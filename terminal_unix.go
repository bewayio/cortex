//go:build !windows

package main

import (
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

// killProcessTree kills pid and every live descendant of it. Walks the
// process tree via `ps` (same pid/ppid columns on Linux and macOS) instead
// of relying on process-group/session membership: an interactive shell's
// job control puts each background `&` job in its own process group within
// the same session, so a plain `syscall.Kill(-pid, ...)` process-group kill
// does NOT reach it — confirmed empirically (a `sleep 999 &` survived that
// approach in testing). See .specs/tasks/terminal-process-cleanup.md.
func killProcessTree(pid int) {
	for _, child := range psChildrenOf(pid) {
		killProcessTree(child)
	}
	_ = syscall.Kill(pid, syscall.SIGKILL)
}

func psChildrenOf(parent int) []int {
	out, err := exec.Command("ps", "-A", "-o", "pid,ppid").Output()
	if err != nil {
		return nil
	}
	var children []int
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 {
			continue
		}
		pid, err1 := strconv.Atoi(fields[0])
		ppid, err2 := strconv.Atoi(fields[1])
		if err1 == nil && err2 == nil && ppid == parent {
			children = append(children, pid)
		}
	}
	return children
}
