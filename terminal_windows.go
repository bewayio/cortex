//go:build windows

package main

// Windows PTY support is an open gap (ADR-0004, terminal.md) — a no-op so
// the build still compiles. The existing single-process cmd.Process.Kill()
// (CloseTerminal/shutdown in app.go) stays the only kill on Windows, same
// behavior as before this task.
func killProcessTree(pid int) {}
