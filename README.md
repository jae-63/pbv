# PBV — Programming By Voice

A macOS + VSCode toolkit for writing code by voice. The design revives a workflow built around 2000 using Dragon NaturallySpeaking and Emacs, re-implemented in 2026 on modern tools: Whisper for speech recognition, a local LLM for command interpretation, and a VSCode extension for editor integration.

## How it works

Two processes collaborate:

```
Microphone → [macOS Swift app] → TCP → [VSCode extension]
                                            ↓
                                  fast-path regex rules
                                            ↓ (if no match)
                                       local LLM
                                            ↓
                                    editor action
```

**macOS app** (`macos-app/`) — a menu-bar app built in Swift. Captures audio from the default input device, sends it to a local `whisper-server` for transcription, and forwards the resulting text to the VSCode extension over a TCP socket on `localhost:7890`. Handles AirPod switching, silence gating, and mode state.

**VSCode extension** (`vscode-extension/`) — listens on the TCP socket and interprets each transcript. Common commands (navigation, deletion, formatting, mode switching) are matched by fast regex rules in under 1ms. Anything not matched is sent to a local Ollama instance, which sees the visible lines of the current file and returns a structured command.

## Speech model

### Fast path

Deterministic, sub-millisecond rules for high-frequency commands. Dragon-style continuous speech is supported — a single utterance like `"go to line 32 delete word set mark"` is parsed left-to-right and dispatched as three sequential commands.

### LLM path

Complex or context-dependent commands fall through to a local Ollama model (`qwen2.5:3b` by default). The model sees the current language, cursor position, visible file content, and the utterance, and returns a JSON command. Examples:

- `"select triage completed"` → finds `triage_completed` in the file, selects it
- `"select range create through user"` → selects from `create` to `user` within visible lines
- `"select and cache gig through flag"` → selects `gig_worker_flag`, pushes it to the cache pad
- `"make this async"` (with a function selected) → rewrites the selection

## Cache pad

The cache pad is a live list of identifiers drawn from the current file. It solves the core dictation problem: long identifiers like `admin_create_user` or `UserPoolId` are awkward to spell aloud character by character.

- The cache auto-populates as you edit, surfacing identifiers you're actively using
- `"cache N"` / `"recent N"` inserts item N at the cursor
- `"cache this"` / `"cache that"` explicitly caches the current selection
- `"select and cache X through Y"` selects a range and caches the matched text in one step
- Items are broadcast to the Swift app so it can display them in an overlay

## Identifier formatters

Spoken words are automatically formatted into code identifier conventions:

| You say | Inserted |
|---|---|
| `"snake foo bar"` | `foo_bar` |
| `"camel foo bar"` | `fooBar` |
| `"hammer foo bar"` | `FooBar` |
| `"constant foo bar"` | `FOO_BAR` |
| `"kebab foo bar"` | `foo-bar` |
| `"smash foo bar"` | `foobar` |

## Selecting by voice

You can move the selection to any visible text by speaking words from it. The system tries all common identifier forms automatically, so you don't need to specify punctuation:

```
"select triage completed"              →  finds  triage_completed  or  triageCompleted  etc.
"select range Lambda through record"   →  selects the span from Lambda to record
"select and cache gig through flag"    →  selects gig_worker_flag and caches it
```

Searches are case-insensitive and restricted to the lines currently visible in the editor, so the command never jumps to an off-screen occurrence. After selecting, issue any transformation — `"make this async"`, `"delete word"`, `"cache this"`, etc.

This is a core technique for editing identifiers and comment text without spelling them out character by character. The idea has a long history in voice coding; our implementation is independent.

## Voice commands — overview

| Category | Examples |
|---|---|
| Navigation | `"go to line 42"`, `"up 5"`, `"word 3 on line 12"`, `"top"`, `"end of line"` |
| Completion | `"accept"` / `"accept completion"` — accept the current inline suggestion |
| Deletion | `"delete word"`, `"delete 3 words"`, `"delete line"`, `"delete to end"` |
| Selection | `"select word"`, `"select triage completed"`, `"select range X through Y"` |
| Doc comments | `"function doc"` — Python docstring stub; `"go doc"` — Go `//` comment line |
| Cache | `"cache 2"`, `"recent 3"`, `"cache this"`, `"select and cache X through Y"` |
| Formatting | `"snake ..."`, `"camel ..."`, `"hammer ..."`, `"constant ..."` |
| Characters | `"alpha"` → `a`, `"cap sierra"` → `S`, `"underscore"` → `_` |
| Transactions | `"set mark"`, `"undo transaction"`, `"jump to mark"` |
| Modes | `"command mode"`, `"dictation mode"` |
| Document | `"save"`, `"undo"`, `"redo"`, `"format document"`, `"comment line"` |
| Help | `"what can I say"`, `"show commands"` |

Full vocabulary: `vocab/core.yaml` and the language-specific files (`python.yaml`, `go.yaml`, `terraform.yaml`, `k8s-yaml.yaml`).

## Setup

### Prerequisites

- macOS (Apple Silicon or Intel)
- VSCode
- [whisper-server](https://github.com/ggerganov/whisper.cpp) running as a LaunchAgent on port 8765
- [Ollama](https://ollama.ai) with `qwen2.5:3b` pulled (`ollama pull qwen2.5:3b`)

### Install

```bash
./setup.sh
```

Installs the VSCode extension and compiles vocabulary. The compiled extension is committed to the repo, so no npm is required on the target machine.

### Build the macOS app

```bash
cd macos-app
./build-app.sh
open .build/debug/PBV.app
```

On first launch, grant microphone and accessibility permissions when prompted.

### VSCode settings

```json
{
    "pbv.helpBrowser": "Google Chrome"
}
```

`pbv.helpBrowser` — app name passed to `open -a` when opening the "what can I say" help page. Leave blank to use the system default.

Full settings: `pbv.port` (default 7890), `pbv.ollamaModel`, `pbv.ollamaUrl`, `pbv.maxCacheItems`.

## Development

```bash
cd vscode-extension
npm test          # run Jest unit tests (55 tests)
npm run deploy    # compile + install to ~/.vscode/extensions/local.pbv-0.1.0/
```

Tests cover the fast-path command parser, identifier resolution, and the visible-window excerpt logic. CI runs on every PR via GitHub Actions.

## Repository layout

```
macos-app/          Swift app — audio capture, Whisper, TCP client
vscode-extension/   TypeScript VSCode extension — command dispatch, LLM, cache pad
vocab/              YAML command vocabulary + compiler
scripts/            Analysis utilities
legacy_videos_and_analysis/   Reference recordings from the original ~2000 system
```

## Background

The original system ran on Windows with Dragon NaturallySpeaking 5 and a heavily customised Emacs macro layer. Key ideas that carry forward:

- **Continuous multi-command speech** — one breath can contain several commands; no pause required between them
- **Cache pad** — a visible list of recent identifiers that can be inserted by number, avoiding the need to spell long names
- **NATO phonetics** for single characters
- **Formatter commands** for producing identifier conventions from natural spoken words
- **Selecting by voice** — select text by speaking words from it, then issue a transformation command; the system resolves spoken words to all identifier forms automatically
- **Navigable template placeholders** — templates insert `ALL_CAPS_TEMPLATE` markers that can be jumped to by voice (`"select arguments template"`, `"select returns template"`, etc.)

The `legacy_videos_and_analysis/` directory contains recordings from the original system.
