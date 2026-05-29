#!/usr/bin/env bash
# Verify the full PBV pipeline is alive before a dictation session.
# Usage: ./scripts/smoke_test.sh [port]
#
# Sends a harmless setReady command to the VSCode extension and checks
# for {"ok":true}.  Also probes the whisper-server port.
set -euo pipefail

PORT=${1:-7890}
WHISPER_PORT=8765
PASS=0; FAIL=0

check() {
    local label="$1"; shift
    if "$@" &>/dev/null; then
        echo "  ✓  $label"
        (( PASS++ )) || true
    else
        echo "  ✗  $label"
        (( FAIL++ )) || true
    fi
}

echo "PBV smoke test"
echo "=============="

# 1. VSCode extension TCP socket
RESPONSE=$(python3 -c "
import socket, sys
try:
    s = socket.create_connection(('127.0.0.1', $PORT), timeout=2)
    s.sendall(b'{\"cmd\":\"setReady\",\"ready\":false}\n')
    data = s.recv(256).decode()
    s.close()
    print(data)
except Exception as e:
    sys.exit(1)
" 2>/dev/null)

if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "  ✓  VSCode extension listening on :$PORT"
    (( PASS++ )) || true
else
    echo "  ✗  VSCode extension not responding on :$PORT"
    echo "     → Open VSCode, ensure PBV extension is active (mic icon in status bar)"
    (( FAIL++ )) || true
fi

# 2. whisper-server TCP port
if python3 -c "
import socket, sys
try:
    s = socket.create_connection(('127.0.0.1', $WHISPER_PORT), timeout=2)
    s.close()
except:
    sys.exit(1)
" 2>/dev/null; then
    echo "  ✓  whisper-server listening on :$WHISPER_PORT"
    (( PASS++ )) || true
else
    echo "  ✗  whisper-server not reachable on :$WHISPER_PORT"
    echo "     → Run: launchctl load ~/Library/LaunchAgents/com.voicecoder.whisper.plist"
    (( FAIL++ )) || true
fi

# 3. PBV.app process running
if pgrep -x PBV &>/dev/null; then
    echo "  ✓  PBV.app process running"
    (( PASS++ )) || true
else
    echo "  ✗  PBV.app not running"
    echo "     → Launch: open macos-app/.build/debug/PBV.app"
    (( FAIL++ )) || true
fi

# 4. Microphone permission granted (heuristic: AVCaptureDevice accessible)
if system_profiler SPAudioDataType 2>/dev/null | grep -q "Input Source"; then
    echo "  ✓  Audio input device detected"
    (( PASS++ )) || true
else
    echo "  ~  Could not verify audio input (non-fatal)"
fi

echo ""
echo "$PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
