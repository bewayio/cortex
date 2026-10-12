package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/creack/pty"
	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ─── Data Types ──────────────────────────────────────────────────────────────

type FileNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	IsDir    bool       `json:"isDir"`
	Ext      string     `json:"ext"`
	Children []FileNode `json:"children,omitempty"`
}

type FileInfo struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	ModTime string `json:"modTime"`
	IsDir   bool   `json:"isDir"`
}

type GitFileStatus struct {
	Path        string `json:"path"`
	Status      string `json:"status"`
	StatusLabel string `json:"statusLabel"`
	StatusColor string `json:"statusColor"`
}

type GitCommit struct {
	Hash         string `json:"hash"`
	Message      string `json:"message"`
	Author       string `json:"author"`
	RelativeDate string `json:"relativeDate"`
}

type CommitMeta struct {
	Hash         string `json:"hash"`
	Author       string `json:"author"`
	RelativeDate string `json:"relativeDate"`
	Message      string `json:"message"`
}

type DiffLine struct {
	Text string `json:"text"`
	Kind string `json:"kind"` // "add","remove","hunk","context"
}

type FileDiff struct {
	Path      string     `json:"path"`
	Kind      string     `json:"kind"` // "modified","added","deleted"
	Lines     []DiffLine `json:"lines"`
	Additions int        `json:"additions"`
	Deletions int        `json:"deletions"`
}

type Workspace struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

type WorkspaceState struct {
	OpenFiles     []string `json:"openFiles"`
	ActiveFile    string   `json:"activeFile"`
	ViewMode      string   `json:"viewMode"`
	TerminalCount int      `json:"terminalCount"`
	// Paths pinned in the tab bar for this workspace (see .specs/tasks/pinned-tabs.md).
	// Home is not here — it's a global, workspace-independent tab, always pinned.
	PinnedFiles []string `json:"pinnedFiles"`
}

// ─── Terminal ────────────────────────────────────────────────────────────────

type Terminal struct {
	id     string
	ptmx   *os.File
	cmd    *exec.Cmd
	cancel context.CancelFunc
}

// ─── App ─────────────────────────────────────────────────────────────────────

type App struct {
	ctx           context.Context
	terminals     map[string]*Terminal
	termMu        sync.Mutex
	chatMu        sync.Mutex
	chatAbort     map[string]context.CancelFunc // sessionID → cancel
	quitConfirmed bool                          // set by ConfirmQuit, see beforeClose

	// Workspace filesystem watcher — see watcher.go.
	fsWatcher *fsnotify.Watcher
	fsWatchMu sync.Mutex
	// Overridable for tests (bypasses runtime.EventsEmit, which needs a real
	// Wails context); defaults to the real emit inside WatchWorkspace.
	fsWatchEmit func(paths []string)
}

// Mensagem do chat (espelho do frontend)
type ChatMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Anexo de arquivo/imagem
type ChatAttachment struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	MimeType string `json:"mimeType"` // image/png, image/jpeg, text/plain, etc.
	Data     string `json:"data"`     // base64
}

func NewApp() *App {
	return &App{
		terminals: make(map[string]*Terminal),
		chatAbort: make(map[string]context.CancelFunc),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	for _, dir := range []string{
		bcodeDir(),
		filepath.Join(bcodeDir(), "workspaces"),
		filepath.Join(bcodeDir(), "chats"),
	} {
		os.MkdirAll(dir, 0755) //nolint
	}
	maximiseOnStartup(ctx)
}

// ─── Chat persistence (filesystem — sem limite de tamanho) ────────────────────

func chatPath(wsID, tabID string) string {
	// Sanitiza IDs para uso como nome de arquivo
	safe := func(s string) string {
		r := strings.NewReplacer("/", "_", "\\", "_", ":", "_", " ", "_")
		return r.Replace(s)
	}
	dir := filepath.Join(bcodeDir(), "chats", safe(wsID))
	os.MkdirAll(dir, 0755) //nolint
	return filepath.Join(dir, safe(tabID)+".json")
}

func (a *App) SaveChatMessages(wsID, tabID, jsonData string) error {
	return os.WriteFile(chatPath(wsID, tabID), []byte(jsonData), 0644)
}

func (a *App) LoadChatMessages(wsID, tabID string) string {
	data, err := os.ReadFile(chatPath(wsID, tabID))
	if err != nil {
		return "[]"
	}
	return string(data)
}

func (a *App) DeleteChatMessages(wsID, tabID string) error {
	return os.Remove(chatPath(wsID, tabID))
}

func (a *App) ListChatTabs(wsID string) []string {
	safe := func(s string) string {
		r := strings.NewReplacer("/", "_", "\\", "_", ":", "_", " ", "_")
		return r.Replace(s)
	}
	dir := filepath.Join(bcodeDir(), "chats", safe(wsID))
	entries, err := os.ReadDir(dir)
	if err != nil {
		return []string{}
	}
	tabs := []string{}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
			tabs = append(tabs, strings.TrimSuffix(e.Name(), ".json"))
		}
	}
	return tabs
}

func (a *App) shutdown(ctx context.Context) {
	a.termMu.Lock()
	defer a.termMu.Unlock()
	for _, t := range a.terminals {
		t.cancel()
		t.ptmx.Close()
	}
}

// beforeClose intercepts every window-close request — the native OS chrome,
// and (on Linux, confirmed by reading internal/frontend/desktop/linux in the
// vendored Wails v2.12.0 source) the frontend's own runtime.Quit(), which is
// what the custom frameless-window close button in TitleBar.tsx calls. It
// hands control back to the frontend instead of letting the process exit
// immediately — the old approach (a `beforeunload` handler firing an async
// save with nothing to wait for it) could lose the race against the window
// actually closing, which is why open files weren't reliably restored (bug
// report, 2026-09-27).
//
// This must return false eventually or the window can never close: Wails
// calls this same hook again on every runtime.Quit(), including the one
// ConfirmQuit itself makes — without the quitConfirmed flag, that second
// call re-emits the event and prevents again, forever (regression found by
// the user, same day: the close button stopped working entirely).
func (a *App) beforeClose(ctx context.Context) bool {
	if a.quitConfirmed {
		return false
	}
	runtime.EventsEmit(ctx, "app:before-close")
	return true
}

// ConfirmQuit actually exits, once the frontend has finished persisting
// state in response to the "app:before-close" event (or decided there was
// nothing to save, or hit its own safety timeout).
func (a *App) ConfirmQuit() {
	a.quitConfirmed = true
	runtime.Quit(a.ctx)
}

func bcodeDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".bcode")
}

// ─── Workspace ───────────────────────────────────────────────────────────────

func (a *App) OpenDirectoryDialog() (string, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open Workspace",
	})
	if err != nil {
		return "", err
	}
	return dir, nil
}

func (a *App) GetRecentWorkspaces() []Workspace {
	path := filepath.Join(bcodeDir(), "recent.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return []Workspace{}
	}
	ws := []Workspace{}
	if err := json.Unmarshal(data, &ws); err != nil {
		return []Workspace{}
	}
	if ws == nil {
		ws = []Workspace{}
	}
	return ws
}

// Caps for the two workspace lists (2026-09-27 redesign — replaces the
// earlier "recently closed" model). "Open projects" is small and meant for
// fast switching in the sidebar; "Ever opened" is a longer history shown on
// Home. Neither number came from the user for list 1 — a reasonable default,
// easy to change. See .specs/modules/workspace.md.
const recentWorkspacesCap = 8
const everOpenedWorkspacesCap = 15

func everOpenedPath() string {
	return filepath.Join(bcodeDir(), "ever_opened.json")
}

func (a *App) GetEverOpenedWorkspaces() []Workspace {
	data, err := os.ReadFile(everOpenedPath())
	if err != nil {
		return []Workspace{}
	}
	ws := []Workspace{}
	if err := json.Unmarshal(data, &ws); err != nil {
		return []Workspace{}
	}
	if ws == nil {
		ws = []Workspace{}
	}
	return ws
}

// frontInsertCapped moves (or inserts) an entry to the front of a workspace
// list by id, truncating to cap. Used for "Ever opened" (ever_opened.json),
// which stays most-recently-used-first — it's a history view, not something
// the user hand-arranges.
func frontInsertCapped(list []Workspace, entry Workspace, cap int) []Workspace {
	filtered := make([]Workspace, 0, len(list)+1)
	for _, w := range list {
		if w.ID != entry.ID {
			filtered = append(filtered, w)
		}
	}
	out := append([]Workspace{entry}, filtered...)
	if len(out) > cap {
		out = out[:cap]
	}
	return out
}

// stableUpsertCapped keeps "Open projects" (recent.json) in a stable,
// user-controlled order (2026-10-11, user request: stop reordering on every
// open/switch — a project keeps its position; the only way it moves is the
// user dragging it, via ReorderRecentWorkspaces). An existing entry is left
// exactly where it is (only Name/Path refreshed, in case the folder was
// renamed/moved); a new one is appended at the end. If that pushes the list
// over cap, the front entry is evicted — the only "oldest" signal left once
// there's no more most-recently-used reordering.
func stableUpsertCapped(list []Workspace, entry Workspace, cap int) []Workspace {
	for i, w := range list {
		if w.ID == entry.ID {
			out := append([]Workspace{}, list...)
			out[i] = entry
			return out
		}
	}
	out := append(append([]Workspace{}, list...), entry)
	if len(out) > cap {
		out = out[len(out)-cap:]
	}
	return out
}

// SaveWorkspace opens/switches to a workspace: upserts it into "open
// projects" (recent.json, capped, stable order — stays wherever it already
// is, or gets appended if new) and moves it to the front of "ever opened"
// (ever_opened.json, capped, most-recently-used-first), creating it if new,
// and marks it as last-active.
func (a *App) SaveWorkspace(path string) (string, error) {
	recent := a.GetRecentWorkspaces()
	everOpened := a.GetEverOpenedWorkspaces()

	id := ""
	name := filepath.Base(path)
	for _, w := range recent {
		if w.Path == path {
			id = w.ID
			name = w.Name
			break
		}
	}
	if id == "" {
		for _, w := range everOpened {
			if w.Path == path {
				id = w.ID
				name = w.Name
				break
			}
		}
	}
	if id == "" {
		id = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	entry := Workspace{ID: id, Name: name, Path: path}

	recent = stableUpsertCapped(recent, entry, recentWorkspacesCap)
	everOpened = frontInsertCapped(everOpened, entry, everOpenedWorkspacesCap)

	recentData, err := json.Marshal(recent)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(bcodeDir(), "recent.json"), recentData, 0644); err != nil {
		return "", err
	}
	everData, err := json.Marshal(everOpened)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(everOpenedPath(), everData, 0644); err != nil {
		return "", err
	}
	_ = os.WriteFile(filepath.Join(bcodeDir(), "last_workspace.txt"), []byte(id), 0644)
	return id, nil
}

// ReorderRecentWorkspaces persists the user's drag-reordered "Open projects"
// list — the only way that list's order changes now (2026-10-11), since
// SaveWorkspace keeps it stable otherwise (see stableUpsertCapped). Any id
// not present in the given order is defensive handling against a stale or
// partial list from the frontend — appended at the end, keeping its
// relative order, rather than silently dropped.
func (a *App) ReorderRecentWorkspaces(ids []string) error {
	recent := a.GetRecentWorkspaces()
	byID := make(map[string]Workspace, len(recent))
	for _, w := range recent {
		byID[w.ID] = w
	}

	ordered := make([]Workspace, 0, len(recent))
	seen := make(map[string]bool, len(recent))
	for _, id := range ids {
		if w, ok := byID[id]; ok {
			ordered = append(ordered, w)
			seen[id] = true
		}
	}
	for _, w := range recent {
		if !seen[w.ID] {
			ordered = append(ordered, w)
		}
	}

	data, err := json.Marshal(ordered)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(bcodeDir(), "recent.json"), data, 0644)
}

func (a *App) GetLastWorkspaceID() string {
	data, err := os.ReadFile(filepath.Join(bcodeDir(), "last_workspace.txt"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// CloseWorkspace removes an entry from "Open projects" only — it stays in
// "Ever opened" history. This is the sidebar's quick-list housekeeping
// action; it is distinct from RemoveWorkspace, which forgets the project
// everywhere. Without this split, the only removal action nuked history
// too, which made the two-list model pointless in practice (user report,
// 2026-09-27: closing a project from "Open projects" made it vanish from
// "Ever opened" as well, as if there were only one shared list).
func (a *App) CloseWorkspace(id string) error {
	recent := a.GetRecentWorkspaces()
	filtered := make([]Workspace, 0, len(recent))
	for _, w := range recent {
		if w.ID != id {
			filtered = append(filtered, w)
		}
	}
	data, err := json.Marshal(filtered)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(bcodeDir(), "recent.json"), data, 0644)
}

// RemoveWorkspace permanently deletes an entry from both lists.
func (a *App) RemoveWorkspace(id string) error {
	recent := a.GetRecentWorkspaces()
	filtered := make([]Workspace, 0, len(recent))
	for _, w := range recent {
		if w.ID != id {
			filtered = append(filtered, w)
		}
	}
	data, err := json.Marshal(filtered)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(bcodeDir(), "recent.json"), data, 0644); err != nil {
		return err
	}

	everOpened := a.GetEverOpenedWorkspaces()
	everFiltered := make([]Workspace, 0, len(everOpened))
	for _, w := range everOpened {
		if w.ID != id {
			everFiltered = append(everFiltered, w)
		}
	}
	everData, err := json.Marshal(everFiltered)
	if err != nil {
		return err
	}
	return os.WriteFile(everOpenedPath(), everData, 0644)
}

func (a *App) SaveWorkspaceState(id string, state WorkspaceState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	path := filepath.Join(bcodeDir(), "workspaces", id+".json")
	return os.WriteFile(path, data, 0644)
}

func (a *App) LoadWorkspaceState(id string) WorkspaceState {
	path := filepath.Join(bcodeDir(), "workspaces", id+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		return WorkspaceState{}
	}
	var state WorkspaceState
	if err := json.Unmarshal(data, &state); err != nil {
		return WorkspaceState{}
	}
	return state
}

// ─── File System ─────────────────────────────────────────────────────────────

var skipDirs = map[string]bool{
	".git": true, "node_modules": true, ".build": true,
	".swiftpm": true, "DerivedData": true, ".DS_Store": true,
	"__pycache__": true, ".pytest_cache": true, "target": true,
	"dist": true, ".next": true, ".nuxt": true,
}

func buildFileTree(root string) (FileNode, error) {
	info, err := os.Stat(root)
	if err != nil {
		return FileNode{}, err
	}
	node := FileNode{
		Name:  info.Name(),
		Path:  root,
		IsDir: info.IsDir(),
		Ext:   strings.TrimPrefix(filepath.Ext(info.Name()), "."),
	}
	if !info.IsDir() {
		return node, nil
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return node, nil
	}
	var dirs, files []FileNode
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") && name != ".env" && name != ".gitignore" && name != ".editorconfig" {
			if skipDirs[name] {
				continue
			}
		}
		if e.IsDir() && skipDirs[name] {
			continue
		}
		child, err := buildFileTree(filepath.Join(root, name))
		if err != nil {
			continue
		}
		if e.IsDir() {
			dirs = append(dirs, child)
		} else {
			files = append(files, child)
		}
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].Name < dirs[j].Name })
	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })
	node.Children = append(dirs, files...)
	return node, nil
}

func (a *App) GetFileTree(root string) (FileNode, error) {
	return buildFileTree(root)
}

func (a *App) ReadFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (a *App) WriteFile(path string, content string) error {
	return os.WriteFile(path, []byte(content), 0644)
}

func (a *App) GetFileInfo(path string) (FileInfo, error) {
	info, err := os.Stat(path)
	if err != nil {
		return FileInfo{}, err
	}
	return FileInfo{
		Name:    info.Name(),
		Path:    path,
		Size:    info.Size(),
		ModTime: info.ModTime().Format(time.RFC3339),
		IsDir:   info.IsDir(),
	}, nil
}

func (a *App) RevealInFinder(path string) error {
	cmd := exec.Command("open", "-R", path)
	return cmd.Run()
}

// ─── Claude Chat ─────────────────────────────────────────────────────────────

// findClaudeCLI tenta localizar o binário `claude` no PATH e em locais comuns.
func findClaudeCLI() string {
	if p, err := exec.LookPath("claude"); err == nil {
		return p
	}
	candidates := []string{
		os.Getenv("HOME") + "/.local/bin/claude",
		"/usr/local/bin/claude",
		"/opt/homebrew/bin/claude",
		os.Getenv("HOME") + "/.npm-global/bin/claude",
		os.Getenv("HOME") + "/node_modules/.bin/claude",
		"/usr/bin/claude",
	}
	for _, c := range candidates {
		if c == "/.local/bin/claude" || c == "/.npm-global/bin/claude" || c == "/node_modules/.bin/claude" {
			continue // HOME estava vazio
		}
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

// StartChatStream usa o `claude` CLI com OAuth do Claude Code — mesma autenticação,
// sem precisar de API key separada. Fallback para SDK Anthropic se apiKey fornecida.
// Tokens chegam via eventos "chat:token:{sessionID}" / "chat:done:{sessionID}" / "chat:error:{sessionID}".
func (a *App) StartChatStream(sessionID string, apiKey string, messages []ChatMsg, attachments []ChatAttachment, systemPrompt string, model string) error {
	ctx, cancel := context.WithCancel(a.ctx)
	a.chatMu.Lock()
	if prev, ok := a.chatAbort[sessionID]; ok {
		prev()
	}
	a.chatAbort[sessionID] = cancel
	a.chatMu.Unlock()

	go func() {
		defer func() {
			cancel()
			a.chatMu.Lock()
			delete(a.chatAbort, sessionID)
			a.chatMu.Unlock()
		}()

		// Tenta encontrar o claude CLI: LookPath + fallbacks para paths comuns
		claudePath := findClaudeCLI()

		// ── Caminho 1: claude CLI (OAuth, sem API key) ────────────────────────
		if claudePath != "" {
			a.startChatViaCLI(ctx, sessionID, claudePath, messages, attachments, systemPrompt, model)
			return
		}

		// ── Caminho 2: SDK Anthropic (fallback para API key manual) ───────────
		key := apiKey
		if key == "" {
			key = os.Getenv("ANTHROPIC_API_KEY")
		}
		if key == "" {
			runtime.EventsEmit(a.ctx, "chat:error:"+sessionID,
				"claude CLI not found and no API key configured. Install Claude Code or set ANTHROPIC_API_KEY.")
			return
		}
		a.startChatViaSDK(ctx, sessionID, key, messages, attachments, systemPrompt, model)
	}()

	return nil
}

// buildContentBlocks monta os blocos de conteúdo para o Claude CLI via stream-json.
// Formato correto do CLI (diferente da Anthropic API):
//
//	imagem: {type:"image", data:base64, mimeType:"image/png"}
//	texto:  {type:"text", text:"..."}
func buildContentBlocks(text string, attachments []ChatAttachment) []map[string]interface{} {
	var blocks []map[string]interface{}

	for _, att := range attachments {
		if strings.HasPrefix(att.MimeType, "image/") {
			// Formato correto do Claude CLI — descoberto analisando o plugin VS Code
			blocks = append(blocks, map[string]interface{}{
				"type":     "image",
				"data":     att.Data,
				"mimeType": att.MimeType,
			})
		} else {
			decoded, err := base64.StdEncoding.DecodeString(att.Data)
			if err != nil {
				decoded = []byte(att.Data)
			}
			blocks = append(blocks, map[string]interface{}{
				"type": "text",
				"text": fmt.Sprintf("File: %s\n```\n%s\n```", att.Name, string(decoded)),
			})
		}
	}

	if text != "" {
		blocks = append(blocks, map[string]interface{}{"type": "text", "text": text})
	}
	return blocks
}

// TestImageStream testa especificamente o envio de imagem via stream-json.
// Retorna os primeiros 2000 chars do stdout+stderr para diagnóstico.
func (a *App) TestImageStream(base64Image, mimeType, question string) string {
	path := findClaudeCLI()
	if path == "" {
		return "ERROR: claude CLI not found"
	}
	args := []string{
		"-p",
		"--input-format", "stream-json",
		"--output-format", "stream-json",
		"--verbose",
		"--no-session-persistence",
	}
	msg, _ := json.Marshal(map[string]interface{}{
		"role": "user",
		"content": []map[string]interface{}{
			{"type": "image", "data": base64Image, "mimeType": mimeType},
			{"type": "text", "text": question},
		},
	})
	cmd := exec.Command(path, args...)
	cmd.Env = os.Environ()
	cmd.Stdin = strings.NewReader(string(msg) + "\n")
	out, _ := cmd.CombinedOutput()
	result := string(out)
	if len(result) > 2000 {
		result = result[:2000] + "\n...(truncated)"
	}
	return result
}

// TestClaudeChat testa se o CLI funciona — usado para diagnóstico.
func (a *App) TestClaudeChat() string {
	path := findClaudeCLI()
	if path == "" {
		return "ERROR: claude CLI not found. Searched: " + os.Getenv("HOME") + "/.local/bin/claude and common paths"
	}
	cmd := exec.Command(path, "-p", "say 'ok' only", "--no-session-persistence")
	cmd.Env = os.Environ()
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Sprintf("ERROR running %s: %v\nOutput: %s", path, err, string(out))
	}
	return fmt.Sprintf("OK: path=%s response=%s", path, strings.TrimSpace(string(out)))
}

func (a *App) startChatViaCLI(ctx context.Context, sessionID, claudePath string, messages []ChatMsg, attachments []ChatAttachment, systemPrompt, model string) {
	if len(messages) == 0 {
		runtime.EventsEmit(a.ctx, "chat:error:"+sessionID, "no messages")
		return
	}

	lastMsg := messages[len(messages)-1].Content

	// Verifica se há imagens nos anexos
	hasImages := false
	for _, att := range attachments {
		if strings.HasPrefix(att.MimeType, "image/") {
			hasImages = true
			break
		}
	}

	// Args base comuns a ambos os modos
	baseArgs := []string{"--no-session-persistence"}
	if systemPrompt != "" {
		baseArgs = append(baseArgs, "--system-prompt", systemPrompt)
	}
	if len(messages) > 1 {
		var hist strings.Builder
		hist.WriteString("Conversation history:\n")
		for _, m := range messages[:len(messages)-1] {
			role := "Human"
			if m.Role == "assistant" {
				role = "Assistant"
			}
			hist.WriteString(fmt.Sprintf("%s: %s\n", role, m.Content))
		}
		baseArgs = append(baseArgs, "--append-system-prompt", hist.String())
	}
	if model != "" && model != "claude-sonnet-4-6" {
		baseArgs = append(baseArgs, "--model", model)
	}

	// ── Com imagens: usa --input-format stream-json com formato correto do CLI ──
	// Formato descoberto analisando o plugin VS Code: {type:"image", data:base64, mimeType:"..."}
	if hasImages {
		streamArgs := append(
			[]string{"-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"},
			baseArgs...,
		)
		blocks := buildContentBlocks(lastMsg, attachments)
		msgJSON, _ := json.Marshal(map[string]interface{}{"role": "user", "content": blocks})
		cmd := exec.CommandContext(ctx, claudePath, streamArgs...)
		cmd.Env = os.Environ()
		cmd.Stdin = strings.NewReader(string(msgJSON) + "\n")
		a.runStreamJSON(ctx, sessionID, cmd)
		return
	}

	// ── Sem imagens: plain text output (mais simples e confiável) ──
	// Inclui arquivos de texto no prompt
	if len(attachments) > 0 {
		textBlocks := buildContentBlocks(lastMsg, attachments)
		var parts []string
		for _, b := range textBlocks {
			if t, ok := b["text"].(string); ok {
				parts = append(parts, t)
			}
		}
		if len(parts) > 0 {
			lastMsg = strings.Join(parts, "\n\n")
		}
	}

	args := append([]string{"-p", lastMsg}, baseArgs...)
	cmd := exec.CommandContext(ctx, claudePath, args...)
	cmd.Env = os.Environ()

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		runtime.EventsEmit(a.ctx, "chat:error:"+sessionID, err.Error())
		return
	}
	stderrBuf := &strings.Builder{}
	cmd.Stderr = stderrBuf

	if err := cmd.Start(); err != nil {
		runtime.EventsEmit(a.ctx, "chat:error:"+sessionID, err.Error())
		return
	}

	// Lê stdout em chunks de 256 bytes e emite cada pedaço como token.
	// Funciona mesmo quando o processo bufferiza a saída.
	buf := make([]byte, 256)
	for {
		n, readErr := stdout.Read(buf)
		if n > 0 {
			runtime.EventsEmit(a.ctx, "chat:token:"+sessionID, string(buf[:n]))
		}
		if readErr != nil {
			break
		}
	}

	if werr := cmd.Wait(); werr != nil && ctx.Err() == nil && stderrBuf.Len() > 0 {
		runtime.EventsEmit(a.ctx, "chat:error:"+sessionID, strings.TrimSpace(stderrBuf.String()))
		return
	}
	runtime.EventsEmit(a.ctx, "chat:done:"+sessionID, nil)
}

// runStreamJSON lida com stream-json para mensagens com anexos multimodais.
func (a *App) runStreamJSON(ctx context.Context, sessionID string, cmd *exec.Cmd) {
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		runtime.EventsEmit(a.ctx, "chat:error:"+sessionID, err.Error())
		return
	}
	stderrBuf := &strings.Builder{}
	stdoutAll := &strings.Builder{} // captura tudo para diagnóstico
	cmd.Stderr = stderrBuf
	if err := cmd.Start(); err != nil {
		runtime.EventsEmit(a.ctx, "chat:error:"+sessionID, err.Error())
		return
	}
	reader := bufio.NewReaderSize(stdout, 4*1024*1024)
	gotTokens := false
	for {
		line, err := reader.ReadString('\n')
		if len(line) > 0 {
			stdoutAll.WriteString(line)
			var outer map[string]interface{}
			if json.Unmarshal([]byte(strings.TrimRight(line, "\r\n")), &outer) == nil {
				outerType, _ := outer["type"].(string)
				if outerType == "stream_event" {
					if ev, ok := outer["event"].(map[string]interface{}); ok {
						if ev["type"] == "content_block_delta" {
							if d, ok := ev["delta"].(map[string]interface{}); ok && d["type"] == "text_delta" {
								if t, ok := d["text"].(string); ok {
									gotTokens = true
									runtime.EventsEmit(a.ctx, "chat:token:"+sessionID, t)
								}
							}
						}
					}
				} else if outerType == "result" {
					if !gotTokens {
						// result sem tokens — verifica se houve erro
						if stderrBuf.Len() > 0 {
							runtime.EventsEmit(a.ctx, "chat:error:"+sessionID, "stream-json error: "+strings.TrimSpace(stderrBuf.String()))
						} else {
							runtime.EventsEmit(a.ctx, "chat:error:"+sessionID, "No response from claude. Check if --input-format stream-json is supported in your version.")
						}
						cmd.Wait()
						return
					}
					runtime.EventsEmit(a.ctx, "chat:done:"+sessionID, nil)
					cmd.Wait()
					return
				}
			}
		}
		if err != nil {
			break
		}
	}
	if werr := cmd.Wait(); werr != nil && ctx.Err() == nil && stderrBuf.Len() > 0 {
		runtime.EventsEmit(a.ctx, "chat:error:"+sessionID, strings.TrimSpace(stderrBuf.String()))
		return
	}
	runtime.EventsEmit(a.ctx, "chat:done:"+sessionID, nil)
}

func (a *App) startChatViaSDK(ctx context.Context, sessionID, apiKey string, messages []ChatMsg, attachments []ChatAttachment, systemPrompt, model string) {
	client := anthropic.NewClient(option.WithAPIKey(apiKey))
	if model == "" {
		model = "claude-sonnet-4-6"
	}
	apiMsgs := make([]anthropic.MessageParam, len(messages))
	for i, m := range messages {
		if m.Role == "user" {
			if i == len(messages)-1 && len(attachments) > 0 {
				// Última mensagem do usuário: inclui anexos
				var blocks []anthropic.ContentBlockParamUnion
				for _, att := range attachments {
					if strings.HasPrefix(att.MimeType, "image/") {
						blocks = append(blocks, anthropic.NewImageBlockBase64(att.MimeType, att.Data))
					} else {
						decoded, _ := base64.StdEncoding.DecodeString(att.Data)
						blocks = append(blocks, anthropic.NewTextBlock(fmt.Sprintf("File: %s\n```\n%s\n```", att.Name, string(decoded))))
					}
				}
				if m.Content != "" {
					blocks = append(blocks, anthropic.NewTextBlock(m.Content))
				}
				apiMsgs[i] = anthropic.NewUserMessage(blocks...)
			} else {
				apiMsgs[i] = anthropic.NewUserMessage(anthropic.NewTextBlock(m.Content))
			}
		} else {
			apiMsgs[i] = anthropic.NewAssistantMessage(anthropic.NewTextBlock(m.Content))
		}
	}
	params := anthropic.MessageNewParams{
		Model:     anthropic.F(anthropic.Model(model)),
		MaxTokens: anthropic.F(int64(4096)),
		Messages:  anthropic.F(apiMsgs),
	}
	if systemPrompt != "" {
		params.System = anthropic.F([]anthropic.TextBlockParam{anthropic.NewTextBlock(systemPrompt)})
	}
	stream := client.Messages.NewStreaming(ctx, params)
	for stream.Next() {
		event := stream.Current()
		switch e := event.AsUnion().(type) {
		case anthropic.ContentBlockDeltaEvent:
			switch d := e.Delta.AsUnion().(type) {
			case anthropic.TextDelta:
				runtime.EventsEmit(a.ctx, "chat:token:"+sessionID, d.Text)
			}
		}
	}
	if err := stream.Err(); err != nil && ctx.Err() == nil {
		runtime.EventsEmit(a.ctx, "chat:error:"+sessionID, err.Error())
		return
	}
	runtime.EventsEmit(a.ctx, "chat:done:"+sessionID, nil)
}

// StopChatStream cancela um stream em andamento.
func (a *App) StopChatStream(sessionID string) {
	a.chatMu.Lock()
	defer a.chatMu.Unlock()
	if cancel, ok := a.chatAbort[sessionID]; ok {
		cancel()
	}
}

// ─── Git ─────────────────────────────────────────────────────────────────────

func runGit(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func (a *App) GitStatus(root string) ([]GitFileStatus, error) {
	out, err := runGit(root, "status", "--porcelain")
	if err != nil {
		return []GitFileStatus{}, nil
	}
	result := []GitFileStatus{}
	for _, line := range strings.Split(out, "\n") {
		if len(line) < 4 {
			continue
		}
		xy := line[:2]
		path := strings.TrimSpace(line[3:])
		// Handle quoted paths (git quotes paths with special chars)
		if len(path) >= 2 && path[0] == '"' && path[len(path)-1] == '"' {
			path = path[1 : len(path)-1]
		}
		// Handle renames: "old -> new"
		if strings.Contains(path, " -> ") {
			parts := strings.SplitN(path, " -> ", 2)
			path = parts[1]
		}
		// Strip trailing slash (untracked directories)
		path = strings.TrimRight(path, "/")
		status, label, color := parseGitStatus(xy)
		result = append(result, GitFileStatus{
			Path:        path,
			Status:      status,
			StatusLabel: label,
			StatusColor: color,
		})
	}
	return result, nil
}

func parseGitStatus(xy string) (string, string, string) {
	x := string(xy[0])
	y := string(xy[1])
	combined := x + y
	switch {
	case x == "A" || combined == " A":
		return "A", "A", "#98c379"
	case x == "D" || y == "D":
		return "D", "D", "#e06c75"
	case x == "R":
		return "R", "R", "#61afef"
	case x == "?" && y == "?":
		return "U", "U", "#61afef"
	default:
		return "M", "M", "#e5c07b"
	}
}

// GraphCommit inclui hashes dos pais e refs para desenhar o grafo
type GraphCommit struct {
	Hash    string   `json:"hash"`
	Parents []string `json:"parents"`
	Message string   `json:"message"`
	Author  string   `json:"author"`
	Date    string   `json:"relativeDate"`
	Refs    []string `json:"refs"`
}

func (a *App) GitGraphLog(root string, limit int) ([]GraphCommit, error) {
	sep := "\x1f"
	out, err := runGit(root, "log", "--all",
		fmt.Sprintf("--max-count=%d", limit),
		"--pretty=format:%H"+sep+"%P"+sep+"%s"+sep+"%an"+sep+"%ar"+sep+"%D")
	if err != nil {
		return []GraphCommit{}, nil
	}
	commits := []GraphCommit{}
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.Split(line, sep)
		if len(parts) < 6 {
			continue
		}
		parents := []string{}
		for _, p := range strings.Fields(parts[1]) {
			if p != "" {
				parents = append(parents, p)
			}
		}
		refs := []string{}
		if parts[5] != "" {
			for _, r := range strings.Split(parts[5], ", ") {
				r = strings.TrimSpace(r)
				if r == "" {
					continue
				}
				if strings.HasPrefix(r, "HEAD -> ") {
					refs = append(refs, strings.TrimPrefix(r, "HEAD -> "))
				} else if r != "HEAD" {
					refs = append(refs, r)
				}
			}
		}
		commits = append(commits, GraphCommit{
			Hash:    parts[0],
			Parents: parents,
			Message: parts[2],
			Author:  parts[3],
			Date:    parts[4],
			Refs:    refs,
		})
	}
	return commits, nil
}

func (a *App) GitLog(root string, limit int) ([]GitCommit, error) {
	out, err := runGit(root, "log", fmt.Sprintf("--max-count=%d", limit),
		"--pretty=format:%H\x1f%s\x1f%an\x1f%ar")
	if err != nil {
		return []GitCommit{}, nil
	}
	commits := []GitCommit{}
	for _, line := range strings.Split(out, "\n") {
		parts := strings.Split(line, "\x1f")
		if len(parts) != 4 {
			continue
		}
		commits = append(commits, GitCommit{
			Hash:         parts[0],
			Message:      parts[1],
			Author:       parts[2],
			RelativeDate: parts[3],
		})
	}
	return commits, nil
}

func (a *App) GitCurrentBranch(root string) (string, error) {
	out, err := runGit(root, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", nil
	}
	return out, nil
}

func (a *App) GitDiff(root string, path string) (string, error) {
	out, err := runGit(root, "diff", "HEAD", "--", path)
	if err != nil {
		// Try untracked file
		content, readErr := os.ReadFile(filepath.Join(root, path))
		if readErr != nil {
			return "", readErr
		}
		return string(content), nil
	}
	return out, nil
}

func (a *App) GitOriginalContent(root string, path string) (string, error) {
	out, err := runGit(root, "show", "HEAD:"+path)
	if err != nil {
		return "", nil
	}
	return out, nil
}

func (a *App) GitCommitMeta(root string, hash string) (CommitMeta, error) {
	out, err := runGit(root, "show", "-s", "--format=%H\x1f%an\x1f%ar\x1f%B", hash)
	if err != nil {
		return CommitMeta{}, err
	}
	parts := strings.SplitN(out, "\x1f", 4)
	if len(parts) != 4 {
		return CommitMeta{}, fmt.Errorf("unexpected git output")
	}
	return CommitMeta{
		Hash:         parts[0],
		Author:       parts[1],
		RelativeDate: parts[2],
		Message:      strings.TrimSpace(parts[3]),
	}, nil
}

func (a *App) GitCommitFileDiffs(root string, hash string) ([]FileDiff, error) {
	// git diff hash^ hash funciona para todos os tipos de commit (incluindo merges)
	// e garante o formato unified diff padrão
	diffOut, err := runGit(root, "diff", hash+"^", hash, "--unified=3")
	if err != nil {
		// Commit inicial (sem pai) — usa git show
		diffOut, err = runGit(root, "show", hash, "--format=", "--unified=3")
		if err != nil {
			return nil, err
		}
	}
	return parseDiff(diffOut), nil
}

func (a *App) CreateFile(path string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	return f.Close()
}

func (a *App) CreateDirectory(path string) error {
	return os.MkdirAll(path, 0755)
}

func (a *App) RenameFile(oldPath, newPath string) error {
	return os.Rename(oldPath, newPath)
}

func (a *App) DeleteFile(path string) error {
	return os.RemoveAll(path)
}

func parseDiff(raw string) []FileDiff {
	diffs := []FileDiff{}
	var current *FileDiff
	lines := strings.Split(raw, "\n")

	for _, line := range lines {
		switch {
		case strings.HasPrefix(line, "diff --git "):
			if current != nil {
				diffs = append(diffs, *current)
			}
			current = &FileDiff{Kind: "modified"}
		case current == nil:
			continue
		case strings.HasPrefix(line, "deleted file mode"):
			current.Kind = "deleted"
		case strings.HasPrefix(line, "new file mode"):
			current.Kind = "added"
		case strings.HasPrefix(line, "--- "):
			if line == "--- /dev/null" {
				current.Kind = "added"
			} else {
				p := strings.TrimPrefix(line, "--- a/")
				p = strings.TrimPrefix(p, "--- ")
				if current.Path == "" {
					current.Path = p
				}
			}
		case strings.HasPrefix(line, "+++ "):
			if line == "+++ /dev/null" {
				current.Kind = "deleted"
			} else {
				p := strings.TrimPrefix(line, "+++ b/")
				p = strings.TrimPrefix(p, "+++ ")
				current.Path = p
			}
		case strings.HasPrefix(line, "@@"):
			current.Lines = append(current.Lines, DiffLine{Text: line, Kind: "hunk"})
		case strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++"):
			current.Lines = append(current.Lines, DiffLine{Text: line[1:], Kind: "add"})
			current.Additions++
		case strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---"):
			current.Lines = append(current.Lines, DiffLine{Text: line[1:], Kind: "remove"})
			current.Deletions++
		default:
			if line != "" && !strings.HasPrefix(line, "index ") && !strings.HasPrefix(line, "Binary") {
				text := line
				if strings.HasPrefix(text, " ") {
					text = text[1:]
				}
				if current.Lines != nil {
					current.Lines = append(current.Lines, DiffLine{Text: text, Kind: "context"})
				}
			}
		}
	}
	if current != nil {
		diffs = append(diffs, *current)
	}
	return diffs
}

// ─── Terminal ─────────────────────────────────────────────────────────────────

func (a *App) StartTerminal(workdir string) (string, error) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}

	ctx, cancel := context.WithCancel(a.ctx)

	cmd := exec.CommandContext(ctx, shell)
	cmd.Dir = workdir
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		cancel()
		return "", err
	}

	id := strconv.FormatInt(time.Now().UnixNano(), 16)

	term := &Terminal{
		id:     id,
		ptmx:   ptmx,
		cmd:    cmd,
		cancel: cancel,
	}

	a.termMu.Lock()
	a.terminals[id] = term
	a.termMu.Unlock()

	// Stream output to frontend
	go func() {
		buf := make([]byte, 4096)
		reader := bufio.NewReader(ptmx)
		_ = reader
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				if err != io.EOF {
					runtime.LogError(a.ctx, "terminal read error: "+err.Error())
				}
				break
			}
			// Base64 para evitar corrupção de bytes UTF-8 multi-byte pelo JSON
			data := base64.StdEncoding.EncodeToString(buf[:n])
			runtime.EventsEmit(a.ctx, "terminal:data:"+id, data)
		}
		// Terminal exited
		runtime.EventsEmit(a.ctx, "terminal:exit:"+id, nil)
		a.termMu.Lock()
		delete(a.terminals, id)
		a.termMu.Unlock()
	}()

	return id, nil
}

func (a *App) TerminalInput(id string, data string) error {
	a.termMu.Lock()
	term, ok := a.terminals[id]
	a.termMu.Unlock()
	if !ok {
		return fmt.Errorf("terminal %s not found", id)
	}
	_, err := io.WriteString(term.ptmx, data)
	return err
}

func (a *App) TerminalResize(id string, rows int, cols int) error {
	a.termMu.Lock()
	term, ok := a.terminals[id]
	a.termMu.Unlock()
	if !ok {
		return fmt.Errorf("terminal %s not found", id)
	}
	return pty.Setsize(term.ptmx, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
}

func (a *App) CloseTerminal(id string) error {
	a.termMu.Lock()
	term, ok := a.terminals[id]
	if ok {
		delete(a.terminals, id)
	}
	a.termMu.Unlock()
	if !ok {
		return nil
	}
	term.cancel()
	return term.ptmx.Close()
}

// ─── Usage (module: usage) ─────────────────────────────────────────────────
// Read-only observer of the claude CLI's own local session logs. Never writes
// to ~/.claude. See .specs/modules/usage.md.

// DailyUsage is one calendar day (UTC) of aggregated Claude Code token usage.
type DailyUsage struct {
	Date                string `json:"date"` // YYYY-MM-DD, UTC
	InputTokens         int64  `json:"inputTokens"`
	OutputTokens        int64  `json:"outputTokens"`
	CacheCreationTokens int64  `json:"cacheCreationTokens"`
	CacheReadTokens     int64  `json:"cacheReadTokens"`
}

// claudeUsageLine is the minimal shape read from each JSONL line. Only the
// fields needed to reach usage numbers are decoded; message content (text,
// thinking, tool output) is never unmarshaled into memory.
type claudeUsageLine struct {
	Type      string `json:"type"`
	Timestamp string `json:"timestamp"`
	Message   struct {
		Usage *struct {
			InputTokens              int64 `json:"input_tokens"`
			OutputTokens             int64 `json:"output_tokens"`
			CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
			CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
		} `json:"usage"`
	} `json:"message"`
}

// GetClaudeTokenUsage scans every ~/.claude/projects/**/*.jsonl file and
// returns token usage aggregated by calendar day (UTC), sorted ascending.
// Returns an empty slice (not an error) if claude has never been used on
// this machine. Tolerates unreadable or malformed files/lines by skipping
// them, so one bad session never breaks the whole result.
func (a *App) GetClaudeTokenUsage() ([]DailyUsage, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return []DailyUsage{}, nil
	}
	base := filepath.Join(home, ".claude", "projects")
	if _, err := os.Stat(base); err != nil {
		return []DailyUsage{}, nil
	}

	byDay := map[string]*DailyUsage{}

	_ = filepath.WalkDir(base, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".jsonl") {
			return nil
		}
		f, ferr := os.Open(path)
		if ferr != nil {
			return nil
		}
		defer f.Close()

		scanner := bufio.NewScanner(f)
		scanner.Buffer(make([]byte, 0, 1<<20), 1<<24) // up to 16MB per line
		for scanner.Scan() {
			line := scanner.Bytes()
			// Cheap pre-check: skip the majority of lines (user/tool-result,
			// no usage) before paying for a full JSON unmarshal.
			if !bytes.Contains(line, []byte(`"type":"assistant"`)) {
				continue
			}
			var rec claudeUsageLine
			if jsonErr := json.Unmarshal(line, &rec); jsonErr != nil {
				continue
			}
			if rec.Type != "assistant" || rec.Message.Usage == nil {
				continue
			}
			ts, tErr := time.Parse(time.RFC3339, rec.Timestamp)
			if tErr != nil {
				continue
			}
			day := ts.UTC().Format("2006-01-02")
			entry, ok := byDay[day]
			if !ok {
				entry = &DailyUsage{Date: day}
				byDay[day] = entry
			}
			u := rec.Message.Usage
			entry.InputTokens += u.InputTokens
			entry.OutputTokens += u.OutputTokens
			entry.CacheCreationTokens += u.CacheCreationInputTokens
			entry.CacheReadTokens += u.CacheReadInputTokens
		}
		// A scan error (e.g. a line over the buffer cap) just means this file's
		// remaining lines are skipped; other files still contribute.
		_ = scanner.Err()
		return nil
	})

	result := make([]DailyUsage, 0, len(byDay))
	for _, v := range byDay {
		result = append(result, *v)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Date < result[j].Date })
	return result, nil
}
