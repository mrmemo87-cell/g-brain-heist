"""Generate the narration with Kokoro (free, offline) plus a few synthesized sound effects.

Usage:
  KOKORO_MODEL=/path/kokoro-v1.0.onnx KOKORO_VOICES=/path/voices-v1.0.bin \
      python3 scripts/voiceover.py

Model files come from the kokoro-onnx GitHub releases (model-files-v1.0).
Writes public/vo/<scene>.mp3 and public/vo/manifest.json with per-scene durations,
which the Remotion composition reads to size every scene to its narration.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
NARRATION = ROOT / "script" / "narration.json"
OUT = ROOT / "public" / "vo"
SFX = ROOT / "public" / "sfx"
OUT.mkdir(parents=True, exist_ok=True)
SFX.mkdir(parents=True, exist_ok=True)

MODEL = os.environ.get("KOKORO_MODEL", "models/kokoro-v1.0.onnx")
VOICES = os.environ.get("KOKORO_VOICES", "models/voices-v1.0.bin")


def to_mp3(wav: Path, mp3: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-q:a", "3", str(mp3)],
        check=True,
    )
    wav.unlink()


def synth_sfx() -> None:
    sr = 44100
    t = lambda seconds: np.linspace(0, seconds, int(sr * seconds), endpoint=False)

    # Camera shutter: two short noise bursts with fast decay.
    rng = np.random.default_rng(7)
    def burst(length: float, decay: float) -> np.ndarray:
        x = t(length)
        return rng.normal(0, 1, x.size) * np.exp(-x * decay)
    shutter = np.concatenate([burst(0.05, 90), np.zeros(int(sr * 0.04)), burst(0.08, 60)])
    shutter = 0.5 * shutter / np.max(np.abs(shutter))

    # Soft UI click.
    x = t(0.06)
    click = np.sin(2 * np.pi * 1800 * x) * np.exp(-x * 120)
    click = 0.35 * click / np.max(np.abs(click))

    # Success chime: two rising sine notes.
    def note(freq: float, length: float) -> np.ndarray:
        x = t(length)
        return np.sin(2 * np.pi * freq * x) * np.exp(-x * 6)
    chime = np.concatenate([note(659.25, 0.18), note(987.77, 0.42)])
    chime = 0.4 * chime / np.max(np.abs(chime))

    # Paper slide: filtered noise swell.
    x = t(0.5)
    env = np.sin(np.pi * x / 0.5) ** 2
    paper = rng.normal(0, 1, x.size) * env
    paper = np.convolve(paper, np.ones(24) / 24, mode="same")
    paper = 0.3 * paper / np.max(np.abs(paper))

    for name, data in {"shutter": shutter, "click": click, "chime": chime, "paper": paper}.items():
        wav = SFX / f"{name}.wav"
        sf.write(wav, data.astype(np.float32), sr)
        to_mp3(wav, SFX / f"{name}.mp3")


def main() -> int:
    from kokoro_onnx import Kokoro  # imported late so --sfx-only works without the model

    spec = json.loads(NARRATION.read_text())
    kokoro = Kokoro(MODEL, VOICES)
    manifest = {"voice": spec["voice"], "scenes": []}
    for scene in spec["scenes"]:
        samples, sr = kokoro.create(scene["text"], voice=spec["voice"], speed=spec.get("speed", 1.0), lang="en-us")
        wav = OUT / f"{scene['id']}.wav"
        sf.write(wav, samples, sr)
        to_mp3(wav, OUT / f"{scene['id']}.mp3")
        duration = round(len(samples) / sr, 3)
        manifest["scenes"].append({"id": scene["id"], "title": scene["title"], "text": scene["text"], "seconds": duration})
        print(f"{scene['id']:>8}: {duration:5.2f}s")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    synth_sfx()
    if "--sfx-only" in sys.argv:
        sys.exit(0)
    sys.exit(main())
