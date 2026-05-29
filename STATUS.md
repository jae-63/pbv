# Voice Coder — Project Status (2026-05-27)

## What this is

A coding-by-voice toolkit for macOS + VSCode, rebuilt from a Dragon NaturallySpeaking /
Emacs system designed ~20 years ago. Two parallel approaches:

1. **Talon-based** (primary, working) — uses [Talon v0.4](https://talonvoice.com) +
   the [voicecoder-talon](https://github.com/jae-63/voicecoder-talon) plugin.
   Continuous speech dictation with embedded cache pad references, NATO phonetics,
   cache pad overlay. No Swift app needed.

2. **Swift app** (secondary, partially built) — captures microphone, parses speech
   into commands, sends them to VSCode via TCP. Compiles cleanly; end-to-end not
   yet fully tested.

The nephew is using the **Talon-based approach** on his machine.

---

## Talon approach — what works

| Feature | Status |
|---|---|
| Cache pad overlay (imgui, draggable, auto-shows) | ✓ working |
| `remember this` / `cache word` to add identifiers | ✓ working |
| `cache N` to insert item N | ✓ working |
| Dictation mode with embedded `cache N` references | ✓ working |
| NATO phonetic alphabet | ✓ working |
| Cursorless disabled (no letter hats on screen) | ✓ working |
| Cache persistence across restarts | ✓ working |

**Setup**: see [voicecoder-talon README](https://github.com/jae-63/voicecoder-talon).
One manual step: add `cache,cash` to community's `words_to_replace.csv`.

---

## Swift app — what is built and compiles

| Component | Status |
|-----------|--------|
| `vocab/core.yaml` | ✓ characters, punctuation, navigation, cache pad, editing |
| `vocab/python.yaml` | ✓ keywords, operators, builtins, patterns |
| `vocab/go.yaml` | ✓ keywords/operators/types — *idiom patterns need Go programmer review* |
| `vocab/terraform.yaml` | ✓ fields, functions, block patterns |
| `vocab/k8s-yaml.yaml` | ✓ fields, kinds, manifest patterns |
| `vocab/compile_vocab.py` | ✓ compiles all YAMLs → compiled.json |
| VSCode extension | ✓ TypeScript compiles clean; installs to `~/.vscode/extensions/` |
| Swift app | ✓ `swift build` passes; `go to line N` command works |

---

## Swift app — what has NOT been tested end-to-end

- [ ] VSCode extension activated and receiving commands
- [ ] Full round-trip: mic → Swift app → TCP → VSCode extension
- [ ] `remember this` / cache pad in Swift app path

### Quick TCP smoke test (once extension is active)

```bash
echo '{"cmd":"gotoLine","line":5}' | nc localhost 7890
echo '{"cmd":"insertText","text":"def hello():"}' | nc localhost 7890
echo '{"cmd":"setMode","mode":"command"}' | nc localhost 7890
```

---

## Setup for a new machine (Swift app path)

```bash
./setup.sh
```

Installs the VSCode extension and compiles vocabulary. No npm or admin rights needed
(compiled `out/` is committed).

### Building the Swift app

```bash
cd macos-app
swift build
.build/debug/PBV
```

First run requests microphone, speech recognition, and accessibility permissions.
**F5** toggles COMMAND / DICTATION mode.

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

← {"event":"cacheUpdate","items":["range_values","words_per_line",...]}
```

Full command list: `vscode-extension/src/types.ts`.

---

## Known gaps / next work

- **Go vocab**: idiom-level patterns should be added by a Go programmer.
- **No-space flag**: `{NOSPACE}` in vocab defined but not wired through Swift app's text assembler.
- **Content-based selection**: `selectToken` in extension is a rough first cut.
- **Xcode project wrapper**: for distributing as a signed .app.
- **.vsix packaging**: `vsce package` produces a one-click-install file.
