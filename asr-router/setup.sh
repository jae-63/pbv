#!/usr/bin/env bash
# PBV ASR router setup: venv, Vosk model, grammar, LaunchAgent.
# Run once from this directory: bash setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# 1. Python venv
# ---------------------------------------------------------------------------
if [ ! -d venv ]; then
    echo "Creating venv..."
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
echo "Dependencies installed."

# ---------------------------------------------------------------------------
# 2. Vosk model download
# ---------------------------------------------------------------------------
# vosk-model-small-en-us-0.15 (40 MB) is fast and accurate enough for
# grammar-constrained command recognition. Upgrade to
# vosk-model-en-us-0.22-lgraph (128 MB) for higher accuracy:
#   MODEL_NAME="vosk-model-en-us-0.22-lgraph"
MODEL_NAME="vosk-model-small-en-us-0.15"
MODEL_URL="https://alphacephei.com/vosk/models/${MODEL_NAME}.zip"

if [ ! -d "vosk-model" ]; then
    echo "Downloading Vosk model (${MODEL_NAME})..."
    curl -L "$MODEL_URL" -o model.zip
    unzip -q model.zip
    mv "$MODEL_NAME" vosk-model
    rm model.zip
    echo "Model ready."
else
    echo "Vosk model already present."
fi

# ---------------------------------------------------------------------------
# 3. Grammar
# ---------------------------------------------------------------------------
echo "Generating grammar.json..."
python3 generate_grammar.py > grammar.json
PHRASE_COUNT=$(python3 -c "import json; d=json.load(open('grammar.json')); print(len(d)-1)")
echo "Grammar: ${PHRASE_COUNT} phrases."

# ---------------------------------------------------------------------------
# 4. LaunchAgent
# ---------------------------------------------------------------------------
PYTHON_BIN="$SCRIPT_DIR/venv/bin/python3"
ROUTER_PY="$SCRIPT_DIR/router.py"
PLIST_DST="$HOME/Library/LaunchAgents/com.pbv.asr-router.plist"

sed "s|PYTHON_BIN|${PYTHON_BIN}|g; s|ROUTER_PY|${ROUTER_PY}|g" \
    com.pbv.asr-router.plist.template > "$PLIST_DST"

launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load  "$PLIST_DST"
echo "LaunchAgent installed: com.pbv.asr-router"

# ---------------------------------------------------------------------------
echo ""
echo "Done. The ASR router is running on port 8766."
echo "whisper-server continues on port 8765 (unchanged)."
echo "Logs: tail -f /tmp/pbv-asr-router.log"
echo ""
echo "Next: restart PBV so it connects to port 8766 instead of 8765."
