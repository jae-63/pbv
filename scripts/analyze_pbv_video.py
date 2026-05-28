#!/usr/bin/env python3
"""
Analyze a programming-by-voice screen recording (Dragon/NaturallySpeaking era).

Pipeline:
  1. Extract scene-change keyframes via ffmpeg
  2. Transcribe audio via local whisper-cli (medium.en)
  3. Send frames + transcript to Claude API for voice-coding analysis
  4. Write a structured markdown reference document

Usage:
  export ANTHROPIC_API_KEY=sk-ant-...
  python3 analyze_pbv_video.py ~/Downloads/perl1animation.mp4  perl_analysis.md
  python3 analyze_pbv_video.py ~/Downloads/animation1.mp4      java_analysis.md
"""

import base64
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import anthropic

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are analyzing a screen recording of someone programming by voice using \
Dragon NaturallySpeaking (circa 1999–2004) with Emacs as the editor. \
The programmer built a sophisticated voice-coding system that includes:

- Custom NaturallySpeaking macros mapped to Emacs Lisp functions
- A numbered "cache pad" (clipboard with numbered slots 1–20) for identifiers
- "Set mark" / "undo transaction" for atomic undo of entire voice operations
- Continuous speech: a single utterance can trigger a sequence of commands
- Code templates triggered by specific voice phrases ("for loop", "if block", etc.)
- Navigation by line number, word-on-line, and token name

Your task: study the chronological frames alongside the audio transcript and produce \
a comprehensive reference document capturing the full command vocabulary and interaction \
model so a modern voice-coding system can reproduce this workflow.

Be exhaustive and specific. Where a frame shows code being typed or the editor \
state changing, describe exactly what changed. Where the transcript contains a \
spoken phrase, identify whether it is a navigation command, a code-generation \
template, a cache-pad operation, or a transaction command.\
"""

USER_PROMPT_TEMPLATE = """\
The {n_frames} images above are scene-change keyframes (in chronological order) \
from a {duration_min:.0f}-minute screen recording titled "{title}".

Below is the Whisper audio transcript with timestamps:

<transcript>
{transcript}
</transcript>

Please produce a structured Markdown reference document with these sections:

## 1. Navigation Commands
Every voice phrase used to move the cursor — by line, word, token, page, etc. \
Include the exact spoken form and the Emacs action it triggered.

## 2. Code Generation Templates
Voice phrases that expand into code blocks (for loops, if statements, function \
definitions, etc.). Show the exact spoken trigger and the generated code where visible.

## 3. Cache Pad Operations
How the numbered slots are populated (automatic on edit? explicit "cache word"?) \
and how they are inserted ("cache 3", "insert 3", etc.).

## 4. Transaction Commands
When "set mark" is used, when "undo transaction" is used, and what patterns \
they protect.

## 5. Multi-Command Utterances
Examples of a single breath producing multiple sequential actions. Show the \
utterance and the action sequence.

## 6. Command Grammar Patterns
The linguistic rules: number words ("line forty-two"), ordinals ("third word"), \
optional prefixes ("go to line" vs "line"), etc.

## 7. Inferred Macro Architecture
What the underlying Emacs Lisp / NatSpeak macros must have looked like — \
argument passing, modes, state.

## 8. Gaps & Uncertainties
Anything unclear in the video that would need clarification from the author.\
"""

# ---------------------------------------------------------------------------
# Step 1: Extract scene-change frames
# ---------------------------------------------------------------------------

def extract_frames(video_path: Path, frames_dir: Path, scene_threshold: float = 0.30) -> list[tuple[float, Path]]:
    """Extract scene-change keyframes; return list of (timestamp_sec, path)."""
    frames_dir.mkdir(parents=True, exist_ok=True)
    out_pattern = str(frames_dir / "frame_%04d.jpg")

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vf", f"select='gt(scene,{scene_threshold})',showinfo",
        "-vsync", "vfr",
        "-q:v", "3",
        out_pattern,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)

    # Parse showinfo output to get timestamps
    timestamps: list[float] = []
    for line in result.stderr.splitlines():
        if "pts_time:" in line:
            try:
                ts = float(line.split("pts_time:")[1].split()[0])
                timestamps.append(ts)
            except (IndexError, ValueError):
                pass

    frames = sorted(frames_dir.glob("frame_*.jpg"))
    if not timestamps:
        # Fallback: use frame index * average interval
        duration = get_duration(video_path)
        timestamps = [i * duration / max(len(frames), 1) for i in range(len(frames))]

    pairs = list(zip(timestamps[:len(frames)], frames))
    print(f"Extracted {len(pairs)} scene-change frames", file=sys.stderr)
    return pairs


def get_duration(video_path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(video_path)],
        capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


# ---------------------------------------------------------------------------
# Step 2: Transcribe audio with local whisper-cli
# ---------------------------------------------------------------------------

def transcribe(video_path: Path, model_path: str) -> str:
    """Extract audio and run whisper-cli; return transcript with timestamps."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "audio.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(video_path),
             "-ar", "16000", "-ac", "1", str(wav)],
            capture_output=True, check=True
        )
        txt = Path(tmp) / "audio.txt"
        result = subprocess.run(
            [
                "/opt/homebrew/bin/whisper-cli",
                "--model", model_path,
                "--file", str(wav),
                "--language", "en",
                "--output-txt",
                "--output-file", str(txt.with_suffix("")),
            ],
            capture_output=True, text=True
        )
        if txt.exists():
            return txt.read_text().strip()
        # whisper appended .txt
        txt2 = Path(str(txt.with_suffix("")) + ".txt")
        if txt2.exists():
            return txt2.read_text().strip()
        return result.stdout.strip()


# ---------------------------------------------------------------------------
# Step 3: Send to Claude
# ---------------------------------------------------------------------------

def load_image_block(path: Path) -> dict:
    data = base64.standard_b64encode(path.read_bytes()).decode()
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": data}}


def analyze(
    frame_pairs: list[tuple[float, Path]],
    transcript: str,
    title: str,
    duration_min: float,
) -> str:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    image_blocks = [load_image_block(p) for _, p in frame_pairs]
    n_frames = len(image_blocks)

    user_text = USER_PROMPT_TEMPLATE.format(
        n_frames=n_frames,
        duration_min=duration_min,
        title=title,
        transcript=transcript[:40_000],   # guard against huge transcripts
    )

    print(f"Sending {n_frames} frames + transcript to Claude...", file=sys.stderr)
    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": image_blocks + [{"type": "text", "text": user_text}]}],
    )
    return response.content[0].text


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 3:
        print("Usage: analyze_pbv_video.py <video.mp4> <output.md> [scene_threshold]")
        sys.exit(1)

    video   = Path(sys.argv[1])
    out     = Path(sys.argv[2])
    thresh  = float(sys.argv[3]) if len(sys.argv) > 3 else 0.30

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    model_path = "/opt/homebrew/share/whisper-cpp/models/ggml-medium.en.bin"
    frames_dir = Path(tempfile.mkdtemp(prefix="pbv_frames_"))
    title      = video.stem.replace("_", " ").replace("animation", "").strip() or video.stem
    duration   = get_duration(video) / 60

    print(f"Video: {video.name}  ({duration:.1f} min)", file=sys.stderr)

    print("Step 1: extracting frames...", file=sys.stderr)
    frame_pairs = extract_frames(video, frames_dir, thresh)

    print("Step 2: transcribing audio...", file=sys.stderr)
    transcript = transcribe(video, model_path)
    print(f"Transcript: {len(transcript)} chars", file=sys.stderr)

    print("Step 3: Claude analysis...", file=sys.stderr)
    result = analyze(frame_pairs, transcript, title, duration)

    out.write_text(result)
    print(f"Written to {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
