#!/usr/bin/env python3
"""
PBV ASR router — Vosk grammar fast path with whisper-server fallback.

Listens on port 8766. The Swift PBV app POSTs multipart/form-data WAV audio
(same format as whisper-server expects on port 8765). We try Vosk against the
command grammar first: on a match we respond immediately with a whisper-format
JSON payload. On no match we forward the raw request to whisper-server.

Start manually:  python3 router.py
Via LaunchAgent: see setup.sh
Logs:            /tmp/pbv-asr-router.log
"""

import io
import json
import logging
import wave
from pathlib import Path

import requests
import vosk
from flask import Flask, Response, request

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR     = Path(__file__).parent
MODEL_PATH   = BASE_DIR / "vosk-model"
GRAMMAR_PATH = BASE_DIR / "grammar.json"
WHISPER_URL  = "http://127.0.0.1:8765/inference"
ROUTER_PORT  = 8766

# ---------------------------------------------------------------------------
# Start-up: load model + grammar (once, at import time)
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("asr-router")

vosk.SetLogLevel(-1)  # silence Vosk's own verbose output

if not MODEL_PATH.exists():
    raise RuntimeError(
        f"Vosk model not found at {MODEL_PATH}. Run setup.sh first."
    )

model = vosk.Model(str(MODEL_PATH))

with open(GRAMMAR_PATH) as f:
    grammar_phrases = json.load(f)
grammar_str = json.dumps(grammar_phrases)

log.info("Vosk model loaded — %d grammar phrases", len(grammar_phrases) - 1)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def extract_wav(body: bytes, content_type: str) -> bytes | None:
    """Extract the 'file' part from a multipart/form-data body."""
    boundary = None
    for token in content_type.split(";"):
        token = token.strip()
        if token.lower().startswith("boundary="):
            boundary = token[9:].strip('"')
            break
    if not boundary:
        return None

    sep = ("--" + boundary).encode()
    for chunk in body.split(sep)[1:]:
        if b"\r\n\r\n" not in chunk:
            continue
        headers_raw, _, payload = chunk.partition(b"\r\n\r\n")
        if b'name="file"' in headers_raw:
            return payload.rstrip(b"\r\n-")
    return None


def vosk_recognize(wav_bytes: bytes) -> str | None:
    """
    Run Vosk with the command grammar on raw WAV bytes.
    Returns the matched phrase (lower-case) or None on no confident match.
    """
    try:
        with wave.open(io.BytesIO(wav_bytes)) as wf:
            rate   = wf.getframerate()
            frames = wf.readframes(wf.getnframes())
    except Exception as exc:
        log.warning("WAV parse error: %s", exc)
        return None

    rec = vosk.KaldiRecognizer(model, rate, grammar_str)
    rec.AcceptWaveform(frames)
    result = json.loads(rec.FinalResult())
    text   = result.get("text", "").strip()

    # "[unk]" means Vosk couldn't match any grammar phrase confidently
    return text if text and text != "[unk]" else None


def make_vosk_response(text: str) -> Response:
    """Synthesise a whisper-server-format JSON response for a Vosk match."""
    payload = json.dumps({
        "text": " " + text,   # whisper-server conventionally adds a leading space
        "segments": [{"no_speech_prob": 0.0, "avg_logprob": 0.0, "temperature": 0.0}],
    })
    return Response(payload, status=200, mimetype="application/json")


# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------

app = Flask(__name__)


@app.route("/inference", methods=["POST"])
def inference() -> Response:
    body         = request.get_data()
    content_type = request.content_type or ""

    wav = extract_wav(body, content_type)
    if wav:
        match = vosk_recognize(wav)
        if match:
            log.info("vosk  → %r", match)
            return make_vosk_response(match)
        log.info("vosk  → (no match) — forwarding to whisper-server")
    else:
        log.warning("Could not extract WAV from request — forwarding to whisper-server")

    # Forward verbatim to whisper-server
    try:
        resp = requests.post(
            WHISPER_URL,
            data=body,
            headers={"Content-Type": content_type},
            timeout=20,
        )
        return Response(
            resp.content,
            status=resp.status_code,
            content_type=resp.headers.get("Content-Type", "application/json"),
        )
    except requests.RequestException as exc:
        log.error("whisper-server unreachable: %s", exc)
        return Response(
            json.dumps({"text": "", "segments": []}),
            status=503,
            mimetype="application/json",
        )


@app.route("/health")
def health() -> Response:
    return Response("ok", status=200)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=ROUTER_PORT, debug=False)
