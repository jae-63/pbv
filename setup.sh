#!/usr/bin/env bash
# Voice Coder — one-shot setup for a new machine
# Works without npm, Node, or any package manager on the target machine.
# The compiled extension (out/) is included in the repo.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_SRC="$REPO_DIR/vscode-extension"
EXT_DST="$HOME/.vscode/extensions/pbv-0.1.0"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
step()   { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. Check VSCode is installed
# ---------------------------------------------------------------------------
step "Checking VSCode"
if ! command -v code &>/dev/null; then
    yellow "  'code' command not found."
    yellow "  Open VSCode, press Cmd+Shift+P, run 'Shell Command: Install code in PATH', then re-run this script."
    exit 1
fi
green "  VSCode: $(code --version | head -1)"

# ---------------------------------------------------------------------------
# 2. Ensure the compiled extension exists
# ---------------------------------------------------------------------------
step "Checking compiled extension"
if [[ ! -d "$EXT_SRC/out" ]]; then
    yellow "  out/ directory missing — attempting to compile..."
    if command -v npm &>/dev/null; then
        (cd "$EXT_SRC" && npm install --silent && npm run compile)
        green "  Compiled successfully."
    else
        red "  npm not found and out/ is missing. Ask the toolkit author to ship out/ pre-compiled."
        exit 1
    fi
else
    green "  Pre-compiled extension found."
fi

# ---------------------------------------------------------------------------
# 3. Install extension into ~/.vscode/extensions/
# ---------------------------------------------------------------------------
step "Installing VSCode extension"
rm -rf "$EXT_DST"
mkdir -p "$EXT_DST"
cp -r "$EXT_SRC/out"          "$EXT_DST/"
cp    "$EXT_SRC/package.json" "$EXT_DST/"
green "  Installed to $EXT_DST"

# ---------------------------------------------------------------------------
# 4. Compile vocabulary (if Python 3 and pyyaml are available)
# ---------------------------------------------------------------------------
step "Compiling vocabulary"
if python3 -c "import yaml" &>/dev/null 2>&1; then
    python3 "$REPO_DIR/vocab/compile_vocab.py"
    COMPILED_DST="$REPO_DIR/macos-app/Sources/PBV/Resources/compiled.json"
    cp "$REPO_DIR/vocab/compiled.json" "$COMPILED_DST"
    green "  Vocabulary compiled ($(python3 -c "import json; d=json.load(open('$REPO_DIR/vocab/compiled.json')); print(len(d['entries']))") entries)."
else
    yellow "  pyyaml not found — skipping vocab recompile (pre-compiled vocab is still usable)."
    yellow "  To enable: pip install pyyaml"
fi

# ---------------------------------------------------------------------------
# 5. Check macOS app (Swift app must be built separately in Xcode)
# ---------------------------------------------------------------------------
step "macOS app status"
APP_BIN="$REPO_DIR/macos-app/.build/debug/PBV"
if [[ -f "$APP_BIN" ]]; then
    green "  Swift app found: $APP_BIN"
else
    yellow "  Swift app not yet built."
    yellow "  To build:  cd macos-app && swift build"
    yellow "  To run:    $REPO_DIR/macos-app/.build/debug/PBV"
    yellow "  First run will ask for Microphone, Speech Recognition, and Accessibility permissions."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
cat <<EOF

$(green "Setup complete.")

Next steps
──────────
1. Reload VSCode:        Cmd+Shift+P → "Developer: Reload Window"
2. Verify the extension: look for ⌨ DICTATION in the status bar (bottom left)
                         and a "Cache Pad" panel in the Explorer sidebar.
3. Build the Swift app:  cd "$REPO_DIR/macos-app" && swift build
4. Run the Swift app:    open "$REPO_DIR/macos-app/.build/debug/PBV"
   - Grant Microphone permission when prompted.
   - Grant Speech Recognition permission when prompted.
   - Grant Accessibility permission (required for F5 hotkey)
     in System Settings → Privacy & Security → Accessibility.
5. Press F5 to toggle between COMMAND and DICTATION mode.

To update the vocabulary after editing a .yaml file:
   python3 "$REPO_DIR/vocab/compile_vocab.py"
   cp "$REPO_DIR/vocab/compiled.json" "$REPO_DIR/macos-app/Sources/PBV/Resources/compiled.json"
   swift build (in macos-app/)
   Re-run the Swift app.

EOF
