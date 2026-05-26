# Voice Coder — Project Status (2026-05-26)

## What this is

A coding-by-voice toolkit for macOS + VSCode, rebuilt from a Dragon NaturallySpeaking /
Emacs system designed ~20 years ago. Two components:

1. **Swift menu bar app** — captures microphone, parses speech into commands, sends them to VSCode via TCP
2. **VSCode extension** — receives commands, executes them in the editor, maintains a live Cache Pad of recently-used identifiers

Languages supported: Python (full), Go (keyword/operator level), Terraform, k8s YAML.

---

## What is built and compiles

| Component | Status |
|-----------|--------|
| `vocab/core.yaml` | ✓ characters, punctuation, navigation, cache pad, editing |
| `vocab/python.yaml` | ✓ keywords, operators, builtins, patterns, async, threading, multiprocessing, closures, introspection, metaclasses |
| `vocab/go.yaml` | ✓ keywords/operators/types — *idiom patterns need review by a Go programmer* |
| `vocab/terraform.yaml` | ✓ fields, functions, block patterns |
| `vocab/k8s-yaml.yaml` | ✓ fields, kinds, manifest patterns |
| `vocab/compile_vocab.py` | ✓ compiles all YAMLs → compiled.json (546 entries) |
| VSCode extension | ✓ TypeScript compiles clean; installed to `~/.vscode/extensions/voice-coder-0.1.0/` |
| Swift app | ✓ `swift build` passes clean |

---

## What has NOT been tested yet

- [ ] VSCode extension activated (needs VSCode reload — `Cmd+Shift+P` → Developer: Reload Window)
- [ ] TCP server accepting commands (test with netcat, see below)
- [ ] Swift app run (needs microphone + speech + accessibility permissions on first launch)
- [ ] End-to-end: Swift app → TCP → VSCode extension

### Quick TCP smoke test (once extension is active)

Open any file in VSCode, then in a terminal:

```bash
# Should return {"ok":true} and move cursor to nearest line ≡ 5 mod 100
echo '{"cmd":"gotoLine","line":5}' | nc localhost 7890

# Should insert text at cursor
echo '{"cmd":"insertText","text":"def hello():"}' | nc localhost 7890

# Should change status bar to COMMAND mode
echo '{"cmd":"setMode","mode":"command"}' | nc localhost 7890
```

---

## Setup for a new machine

```bash
./setup.sh
```

This installs the VSCode extension and compiles vocabulary. No npm or admin rights needed
on the target machine (the compiled `out/` directory is included).

---

## Building and running the Swift app

```bash
cd macos-app
swift build
.build/debug/VoiceCoder
```

First run will request:
1. Microphone access (system dialog)
2. Speech Recognition access (system dialog)
3. Accessibility access for F5 hotkey (System Settings → Privacy & Security → Accessibility)

**F5** toggles between COMMAND and DICTATION mode. A small HUD in the top-right corner
of the screen shows the current mode and last recognised utterance.

---

## How it works

### Modes

| Mode | What speech does |
|------|-----------------|
| DICTATION | Text is inserted, with vocab substitutions (e.g. "dollar sign" → `$`) |
| COMMAND | Utterance is parsed as a command; no match → silently ignored |

Cache pad commands (`cache 3`, `remember this`, etc.) work in both modes.

### Key commands (command mode)

| Say | Action |
|-----|--------|
| `go to line thirty four` | Jump to nearest line ≡ 34 mod 100 |
| `jump to third word on line twelve` | Jump to 3rd token on nearest line ≡ 12 mod 100 |
| `cache seven` / `recent seven` | Insert cache pad item #7 |
| `remember this` | Add word under cursor to cache pad |
| `update cache` | Rescan document into cache pad |
| `kill five characters` | Delete 5 characters |
| `move down three` | Cursor down 3 lines |
| `undo` / `redo` | Undo / redo |
| `start transaction` / `end transaction` | Group edits into one undo step |
| `format document` | Run VSCode formatter |
| `save` | Save file |

### Extending the vocabulary

Edit any `vocab/*.yaml` file, then:

```bash
python3 vocab/compile_vocab.py
cp vocab/compiled.json macos-app/Sources/VoiceCoder/Resources/compiled.json
cd macos-app && swift build
```

No VSCode extension rebuild needed — the extension receives text/commands from the Swift
app and doesn't know about the vocab directly.

---

## IPC protocol (Swift app → VSCode extension)

TCP on `localhost:7890`. Newline-delimited JSON.

```
→ {"cmd":"insertText","text":"def "}
← {"ok":true}

→ {"cmd":"gotoLine","line":34}
← {"ok":true}

→ {"cmd":"setMode","mode":"command"}
← {"ok":true}

← {"event":"cacheUpdate","items":["range_values","words_per_line",...]}  ← pushed any time cache changes
```

Full command list: `vscode-extension/src/types.ts`.

---

## Known gaps / next work

- **Go vocab**: idiom-level patterns (e.g. `context.WithCancel`, table-driven tests) should be added by someone who writes Go.
- **No-space flag**: `{NOSPACE}` in vocab is defined but not yet wired through the Swift app's text assembler.
- **Content-based selection** ("select equal two"): implemented as `selectToken` in extension but is a rough first cut — finds first occurrence forward from cursor.
- **Xcode project wrapper**: for distributing as a signed .app, wrap the SPM package in an Xcode project with proper entitlements.
- **CONTRIBUTING_VOCAB.md**: schema documentation for extending vocabulary.
- **.vsix packaging**: `npm install -g @vscode/vsce && cd vscode-extension && vsce package` produces a distributable one-click-install file.
