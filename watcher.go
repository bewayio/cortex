package main

// Module: files (parte de observação de workspace). Ver .specs/modules/files.md
// e .specs/tasks/file-watching-auto-reload.md.

import (
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const fsWatchDebounce = 300 * time.Millisecond

// WatchWorkspace inicia (ou reinicia) um watcher recursivo na pasta `root`.
// fsnotify não observa subpastas sozinho — cada uma é adicionada à mão ao
// caminhar a árvore, e pastas criadas depois são adicionadas dinamicamente
// no loop de eventos. Chamar de novo com uma `root` diferente fecha o
// watcher anterior primeiro — o frontend não precisa de uma chamada de
// "parar" separada ao trocar de workspace.
func (a *App) WatchWorkspace(root string) error {
	a.fsWatchMu.Lock()
	defer a.fsWatchMu.Unlock()

	if a.fsWatcher != nil {
		a.fsWatcher.Close()
		a.fsWatcher = nil
	}

	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	walkErr := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // pasta pode ter sido removida durante o walk; ignora e segue
		}
		if !info.IsDir() {
			return nil
		}
		if path != root && skipDirs[info.Name()] {
			return filepath.SkipDir
		}
		if addErr := w.Add(path); addErr != nil {
			log.Println("watcher: failed to watch", path, addErr)
		}
		return nil
	})
	if walkErr != nil {
		w.Close()
		return walkErr
	}

	emit := a.fsWatchEmit
	if emit == nil {
		emit = func(paths []string) { runtime.EventsEmit(a.ctx, "files:changed", paths) }
	}

	a.fsWatcher = w
	go watchLoop(w, emit)
	return nil
}

// watchLoop lê os eventos crus do fsnotify, agrupa numa janela de debounce
// (várias gravações em sequência — comum em saves de editores/build tools —
// viram UM evento só) e publica a lista de paths alterados via `emit`.
// Roda até o watcher ser fechado (channel `Events` fecha quando isso
// acontece, encerrando a goroutine sozinha).
func watchLoop(w *fsnotify.Watcher, emit func(paths []string)) {
	var mu sync.Mutex
	changed := map[string]bool{}
	var timer *time.Timer

	flush := func() {
		mu.Lock()
		if len(changed) == 0 {
			mu.Unlock()
			return
		}
		paths := make([]string, 0, len(changed))
		for p := range changed {
			paths = append(paths, p)
		}
		changed = map[string]bool{}
		mu.Unlock()
		emit(paths)
	}

	for {
		select {
		case event, ok := <-w.Events:
			if !ok {
				return
			}
			if event.Op&fsnotify.Create != 0 {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() && !skipDirs[filepath.Base(event.Name)] {
					w.Add(event.Name)
				}
			}
			mu.Lock()
			changed[event.Name] = true
			mu.Unlock()
			if timer != nil {
				timer.Stop()
			}
			timer = time.AfterFunc(fsWatchDebounce, flush)
		case err, ok := <-w.Errors:
			if !ok {
				return
			}
			log.Println("watcher error:", err)
		}
	}
}
