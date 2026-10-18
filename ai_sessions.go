package main

// Module: ai-sessions. Discovers Claude Code and Codex CLI sessions already
// on this machine for the currently open project, so the user can jump back
// into one. See .specs/modules/ai-sessions.md and .specs/tasks/ai-sessions-tab.md.

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"
)

// AiSession is engine-agnostic — Claude Code and Codex both normalize into
// this shape so the frontend renders one kind of card regardless of origin.
type AiSession struct {
	ID        string `json:"id"`
	Engine    string `json:"engine"` // "claude" | "codex"
	Title     string `json:"title"`
	Cwd       string `json:"cwd"`
	CreatedAt int64  `json:"createdAt"` // unix seconds, 0 if unknown
	UpdatedAt int64  `json:"updatedAt"` // unix seconds, 0 if unknown
	IsRunning bool   `json:"isRunning"` // live process (claude) / loaded in memory (codex)
}

// ─── Deletion (hidden-set) ───────────────────────────────────────────────────
// Deleting a session doesn't actually make it disappear on its own: a live
// `claude` process keeps its ~/.claude/sessions/<pid>.json registry entry
// regardless of whatever happened to its .jsonl transcript, and Codex's
// `thread/delete` can refuse to drop a currently-loaded/active thread. Since
// the user-visible meaning of "excluir" here is "make it go away from this
// list", every delete also records the session in a small local hidden-set
// (namespaced by engine, keyed by id) that both List methods consult — this
// stays inside this module's own boundary (doesn't touch Claude/Codex's own
// data beyond what DeleteClaudeSession/DeleteCodexSession already do).
func aiSessionsHiddenFile() string {
	return filepath.Join(bcodeDir(), "ai_sessions_hidden.json")
}

func loadHiddenAiSessions() map[string]bool {
	hidden := map[string]bool{}
	data, err := os.ReadFile(aiSessionsHiddenFile())
	if err != nil {
		return hidden
	}
	var ids []string
	if json.Unmarshal(data, &ids) != nil {
		return hidden
	}
	for _, id := range ids {
		hidden[id] = true
	}
	return hidden
}

func hideAiSession(engine, id string) {
	hidden := loadHiddenAiSessions()
	hidden[engine+"|"+id] = true
	ids := make([]string, 0, len(hidden))
	for k := range hidden {
		ids = append(ids, k)
	}
	data, err := json.Marshal(ids)
	if err != nil {
		return
	}
	_ = os.MkdirAll(bcodeDir(), 0o755)
	_ = os.WriteFile(aiSessionsHiddenFile(), data, 0o644)
}

// ─── Claude Code ─────────────────────────────────────────────────────────────

// claudeLivePidFile is the shape of ~/.claude/sessions/<pid>.json — Claude
// Code's own registry of interactive processes currently running, one file
// per pid. Not a documented format (same risk class as GetClaudeTokenUsage
// already reading ~/.claude/projects) — tolerate unknown/extra fields,
// never fail loudly on a shape change.
type claudeLivePidFile struct {
	Pid       int    `json:"pid"`
	SessionID string `json:"sessionId"`
	Cwd       string `json:"cwd"`
	StartedAt int64  `json:"startedAt"` // epoch milliseconds
	Name      string `json:"name"`
}

func isPidAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// Signal 0 checks existence without actually sending a signal — standard
	// Unix liveness check. On Windows, os.Process.Signal only supports
	// os.Kill meaningfully and returns an error for anything else, so this
	// always reports "not alive" there — an accepted, documented gap (this
	// module's verification was Linux-only, see the task's Fora de Escopo).
	return proc.Signal(syscall.Signal(0)) == nil
}

func claudeSessionsDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".claude", "sessions")
}

func claudeProjectsDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".claude", "projects")
}

// encodeClaudeCwdDir mirrors Claude Code's own directory naming for a
// project (every "/" becomes "-"). Only used to LOCATE a session file we
// already know the id and cwd for (from the live pid registry) as a fast
// path — never relied on to decode a directory name back into a path, which
// would be ambiguous (a path segment with a literal "-" is indistinguishable
// from an encoded "/"). findClaudeSessionFile falls back to a real walk when
// the guess misses, and the includeOlder scan reads `cwd` from inside each
// file instead of ever decoding a directory name.
func encodeClaudeCwdDir(cwd string) string {
	return strings.ReplaceAll(cwd, "/", "-")
}

// claudeSessionFileMeta is everything ListClaudeSessions needs out of one
// .jsonl transcript, gathered in a single bounded pass (never reads a whole
// file — sessions can be 10s of MB).
type claudeSessionFileMeta struct {
	title     string
	cwd       string
	createdAt int64 // timestamp of the earliest scanned record
}

func readClaudeSessionMeta(path string, maxLines int) claudeSessionFileMeta {
	var meta claudeSessionFileMeta
	f, err := os.Open(path)
	if err != nil {
		return meta
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 1<<16), 1<<20)
	for i := 0; i < maxLines && scanner.Scan(); i++ {
		var rec struct {
			Type        string `json:"type"`
			AiTitle     string `json:"aiTitle"`
			CustomTitle string `json:"customTitle"`
			Cwd         string `json:"cwd"`
			Timestamp   string `json:"timestamp"` // RFC3339, present on most records
		}
		if json.Unmarshal(scanner.Bytes(), &rec) != nil {
			continue
		}
		// custom-title (explicitly set by the user) wins over the
		// AI-generated one when both are present.
		if rec.Type == "custom-title" && rec.CustomTitle != "" {
			meta.title = rec.CustomTitle
		} else if rec.Type == "ai-title" && rec.AiTitle != "" && meta.title == "" {
			meta.title = rec.AiTitle
		}
		if rec.Cwd != "" {
			meta.cwd = rec.Cwd
		}
		if meta.createdAt == 0 && rec.Timestamp != "" {
			if t, err := time.Parse(time.RFC3339, rec.Timestamp); err == nil {
				meta.createdAt = t.Unix()
			}
		}
	}
	_ = scanner.Err()
	return meta
}

func claudeFileModTime(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.ModTime().Unix()
}

// findClaudeSessionFile locates <sessionId>.jsonl. Tries the encoded-cwd
// guess first (cheap, correct the vast majority of the time) when cwd is
// known, falling back to a full walk of projectsDir otherwise/on a miss.
func findClaudeSessionFile(projectsDir, cwd, sessionID string) string {
	if cwd != "" {
		guess := filepath.Join(projectsDir, encodeClaudeCwdDir(cwd), sessionID+".jsonl")
		if _, err := os.Stat(guess); err == nil {
			return guess
		}
	}
	var found string
	_ = filepath.WalkDir(projectsDir, func(p string, d os.DirEntry, err error) error {
		if err != nil || found != "" || d.IsDir() {
			return nil
		}
		if d.Name() == sessionID+".jsonl" {
			found = p
		}
		return nil
	})
	return found
}

// ListClaudeSessions returns sessions for the given project (`cwd`, exact
// match — pass "" to not filter by project). includeOlder=false returns only
// sessions with a live `claude` process right now (~/.claude/sessions/*.json,
// pid liveness checked — the file's mere existence is not trusted).
// includeOlder=true also includes every other resumable session found under
// ~/.claude/projects/**/*.jsonl not already one of the live ones. Tolerates a
// missing ~/.claude entirely (claude never used on this machine) — always
// returns a slice, never an error.
func (a *App) ListClaudeSessions(cwd string, includeOlder bool) []AiSession {
	sessions := []AiSession{}
	hidden := loadHiddenAiSessions()
	liveSessionIDs := map[string]bool{}
	projectsDir := claudeProjectsDir()

	if dir := claudeSessionsDir(); dir != "" {
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
				continue
			}
			data, err := os.ReadFile(filepath.Join(dir, e.Name()))
			if err != nil {
				continue
			}
			var pf claudeLivePidFile
			if json.Unmarshal(data, &pf) != nil || pf.SessionID == "" || !isPidAlive(pf.Pid) {
				continue
			}
			if hidden["claude|"+pf.SessionID] {
				continue
			}
			if cwd != "" && pf.Cwd != cwd {
				continue
			}
			liveSessionIDs[pf.SessionID] = true

			title := pf.Name
			createdAt := pf.StartedAt / 1000
			updatedAt := createdAt
			if projectsDir != "" {
				if file := findClaudeSessionFile(projectsDir, pf.Cwd, pf.SessionID); file != "" {
					meta := readClaudeSessionMeta(file, 20)
					if meta.title != "" {
						title = meta.title
					}
					if meta.createdAt != 0 {
						createdAt = meta.createdAt
					}
					updatedAt = claudeFileModTime(file)
				}
			}
			if title == "" {
				title = pf.SessionID
			}
			sessions = append(sessions, AiSession{
				ID: pf.SessionID, Engine: "claude", Title: title, Cwd: pf.Cwd,
				CreatedAt: createdAt, UpdatedAt: updatedAt, IsRunning: true,
			})
		}
	}

	if includeOlder && projectsDir != "" {
		// Known cwd: scan only that project's own directory (fast path, same
		// ambiguity caveat as encodeClaudeCwdDir — falls back to the full
		// walk below when the guess doesn't exist).
		scanRoot := projectsDir
		if cwd != "" {
			guess := filepath.Join(projectsDir, encodeClaudeCwdDir(cwd))
			if info, err := os.Stat(guess); err == nil && info.IsDir() {
				scanRoot = guess
			}
		}
		_ = filepath.WalkDir(scanRoot, func(p string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".jsonl") {
				return nil
			}
			sessionID := strings.TrimSuffix(d.Name(), ".jsonl")
			if liveSessionIDs[sessionID] || hidden["claude|"+sessionID] {
				return nil
			}
			meta := readClaudeSessionMeta(p, 20)
			if cwd != "" && meta.cwd != "" && meta.cwd != cwd {
				return nil // scanRoot fell back to the full tree — filter for real
			}
			title := meta.title
			if title == "" {
				title = sessionID
			}
			updatedAt := claudeFileModTime(p)
			createdAt := meta.createdAt
			if createdAt == 0 {
				createdAt = updatedAt
			}
			sessions = append(sessions, AiSession{
				ID: sessionID, Engine: "claude", Title: title, Cwd: meta.cwd,
				CreatedAt: createdAt, UpdatedAt: updatedAt, IsRunning: false,
			})
			return nil
		})
	}

	sort.Slice(sessions, func(i, j int) bool { return sessions[i].UpdatedAt > sessions[j].UpdatedAt })
	return sessions
}

// ─── Codex ───────────────────────────────────────────────────────────────────
// Codex (0.162.1) has no simple per-session file to read — it's indexed in
// an internal SQLite store with an actively-migrating schema. The sanctioned
// way to query it is the `codex app-server` JSON-RPC protocol, which OpenAI
// itself labels `[experimental]` — confirmed empirically (no docs found)
// during the capture of .specs/tasks/ai-sessions-tab.md by spawning the
// real binary and inspecting its JSON Schema (`codex app-server
// generate-json-schema`) plus a live handshake: newline-delimited JSON over
// stdio, no Content-Length framing (unlike LSP), method names like
// "thread/loaded/list", "thread/list", "thread/delete". No login/auth
// needed for these read-only local calls.
//
// Every failure mode here (codex not installed, protocol/schema drift in a
// future Codex version, a hung subprocess) must degrade to an empty result,
// never an error surfaced to the frontend — confirmed decision with the
// user, given the protocol's own experimental status.

const codexAppServerTimeout = 5 * time.Second

type codexThread struct {
	ID        string `json:"id"`
	Cwd       string `json:"cwd"`
	Name      string `json:"name"`
	Preview   string `json:"preview"`
	CreatedAt int64  `json:"createdAt"` // unix seconds — optimistic field, 0 if the schema doesn't have it
	UpdatedAt int64  `json:"updatedAt"` // unix seconds
}

// codexAppServerCall spawns `codex app-server`, performs the `initialize`
// handshake, sends one request, and returns its raw `result` — then always
// kills the subprocess before returning (one spawn per call, not a
// long-lived daemon: simpler, and this is a convenience browser, not a
// performance-critical path). An unsolicited notification (e.g. this
// version's own `remoteControl/status/changed`, observed during the
// handshake test above) has no `id` and is skipped, not mistaken for a
// response.
func codexAppServerCall(method string, params any) (json.RawMessage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), codexAppServerTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "codex", "app-server")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	defer func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	enc := json.NewEncoder(stdin)
	if err := enc.Encode(map[string]any{
		"id": 1, "method": "initialize",
		"params": map[string]any{"clientInfo": map[string]any{"name": "cortex", "version": "1.0.0"}},
	}); err != nil {
		return nil, err
	}
	if err := enc.Encode(map[string]any{"id": 2, "method": method, "params": params}); err != nil {
		return nil, err
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 1<<16), 1<<22)
	initDone := false
	for scanner.Scan() {
		var msg struct {
			ID     json.RawMessage `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  json.RawMessage `json:"error"`
			Method string          `json:"method"` // present on notifications, absent on responses
		}
		if json.Unmarshal(scanner.Bytes(), &msg) != nil || msg.Method != "" || msg.ID == nil {
			continue // malformed line or a notification — not a response, ignore
		}
		var id int
		if json.Unmarshal(msg.ID, &id) != nil {
			continue
		}
		if id == 1 {
			initDone = true
			continue
		}
		if id == 2 {
			if msg.Error != nil {
				return nil, fmt.Errorf("codex app-server error calling %s: %s", method, string(msg.Error))
			}
			return msg.Result, nil
		}
	}
	_ = scanner.Err()
	if !initDone {
		return nil, fmt.Errorf("codex app-server did not respond to initialize")
	}
	return nil, fmt.Errorf("codex app-server did not respond to %s", method)
}

// ListCodexSessions mirrors ListClaudeSessions' (cwd, includeOlder) contract.
// `thread/loaded/list` returns ids only ("sessions currently loaded in
// memory" — exactly "ainda aberta"); `thread/list` carries the actual
// title/cwd/timestamps, so both are called and cross-referenced by id.
// Capped at 200 threads (no cursor pagination) — acceptable for a
// convenience browser, not a full data export.
func (a *App) ListCodexSessions(cwd string, includeOlder bool) []AiSession {
	sessions := []AiSession{}
	hidden := loadHiddenAiSessions()

	loadedRaw, err := codexAppServerCall("thread/loaded/list", map[string]any{})
	if err != nil {
		return sessions
	}
	var loaded struct {
		Data []string `json:"data"`
	}
	if json.Unmarshal(loadedRaw, &loaded) != nil {
		return sessions
	}
	loadedIDs := map[string]bool{}
	for _, id := range loaded.Data {
		loadedIDs[id] = true
	}
	if !includeOlder && len(loadedIDs) == 0 {
		return sessions
	}

	listParams := map[string]any{"limit": 200}
	if cwd != "" {
		listParams["cwd"] = cwd
	}
	listRaw, err := codexAppServerCall("thread/list", listParams)
	if err != nil {
		return sessions
	}
	var list struct {
		Data []codexThread `json:"data"`
	}
	if json.Unmarshal(listRaw, &list) != nil {
		return sessions
	}
	for _, th := range list.Data {
		if hidden["codex|"+th.ID] {
			continue
		}
		if cwd != "" && th.Cwd != cwd {
			continue // app-server's own cwd filter is best-effort, re-check here
		}
		isLoaded := loadedIDs[th.ID]
		if !includeOlder && !isLoaded {
			continue
		}
		title := th.Name
		if title == "" {
			title = th.Preview
		}
		if title == "" {
			title = th.ID
		}
		createdAt := th.CreatedAt
		if createdAt == 0 {
			createdAt = th.UpdatedAt
		}
		sessions = append(sessions, AiSession{
			ID: th.ID, Engine: "codex", Title: title, Cwd: th.Cwd,
			CreatedAt: createdAt, UpdatedAt: th.UpdatedAt, IsRunning: isLoaded,
		})
	}
	return sessions
}

// DeleteCodexSession calls thread/delete, then always hides the session
// locally regardless of the outcome (see the hidden-set note above — the
// app-server can refuse to delete a currently-loaded/active thread, but the
// user's delete should still make it disappear from this list). The error
// is still returned so a future UI could surface "deleted locally, but the
// remote delete failed" — unlike the list methods, which never error.
func (a *App) DeleteCodexSession(threadID string) error {
	_, err := codexAppServerCall("thread/delete", map[string]any{"threadId": threadID})
	hideAiSession("codex", threadID)
	return err
}

// DeleteClaudeSession removes a session's .jsonl transcript (if found) and
// always hides it locally afterwards (see the hidden-set note above — a live
// `claude` process keeps its own pid-registry entry independent of whatever
// happened to the transcript, so removing just the file isn't enough to make
// it disappear from the list). It does NOT kill a live process still using
// it (.specs/modules/ai-sessions.md's Notes) — if one is, the process keeps
// running and writing fine (Unix: unlinking an open file doesn't error, the
// data is just gone once that process exits).
func (a *App) DeleteClaudeSession(sessionID string) error {
	defer hideAiSession("claude", sessionID)

	projectsDir := claudeProjectsDir()
	if projectsDir == "" {
		return nil
	}
	file := findClaudeSessionFile(projectsDir, "", sessionID)
	if file == "" {
		return nil // nothing to remove — hiding it is still enough to satisfy "excluir"
	}
	return os.Remove(file)
}

// GetInstalledAiEngines reports which AI CLIs are available on PATH, so the
// sidebar only offers a "new session" button for an engine the user actually
// has. See .specs/tasks/ai-terminal-session-persistence-and-new-session-buttons.md.
func (a *App) GetInstalledAiEngines() []string {
	engines := []string{}
	if _, err := exec.LookPath("claude"); err == nil {
		engines = append(engines, "claude")
	}
	if _, err := exec.LookPath("codex"); err == nil {
		engines = append(engines, "codex")
	}
	return engines
}
