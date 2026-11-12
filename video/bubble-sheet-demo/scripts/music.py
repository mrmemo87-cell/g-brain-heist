"""Synthesise a royalty-free lo-fi music bed for the demo (no samples, no downloads).

Writes public/music/bed.mp3: 96 BPM, Am7 - Fmaj7 - Cmaj7 - G6, soft pads, plucked
arpeggio, round bass, and a light kick / snare / hat groove with swing. About 100 s.
Duck it under the narration from the Remotion composition.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

SR = 44100
BPM = 96
BEAT = 60 / BPM
BAR = BEAT * 4
BARS = 40
LENGTH = int(SR * BAR * BARS)
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "music"
OUT.mkdir(parents=True, exist_ok=True)

rng = np.random.default_rng(42)
mix = np.zeros((LENGTH, 2), dtype=np.float64)


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


def add(signal: np.ndarray, start: float, pan: float = 0.0, gain: float = 1.0) -> None:
    i = int(start * SR)
    if i >= LENGTH:
        return
    seg = signal[: LENGTH - i]
    left = gain * (1 - max(0.0, pan))
    right = gain * (1 + min(0.0, pan))
    mix[i : i + seg.size, 0] += seg * left
    mix[i : i + seg.size, 1] += seg * right


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    rc = 1 / (2 * np.pi * cutoff)
    alpha = (1 / SR) / (rc + 1 / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def env(n: int, attack: float, decay: float, sustain: float = 0.0, release: float = 0.0) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.where(t < attack, 1.0, sustain + (1 - sustain) * np.exp(-(t - attack) / max(decay, 1e-4)))
    out = a * d
    if release > 0:
        tail = np.clip((t[-1] - t) / release, 0, 1)
        out = out * tail
    return out


def tone(freq: float, seconds: float, harmonics=((1, 1.0), (2, 0.35), (3, 0.12)), detune: float = 0.0) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    out = np.zeros_like(t)
    for mult, amp in harmonics:
        out += amp * np.sin(2 * np.pi * freq * mult * t)
        if detune:
            out += amp * 0.6 * np.sin(2 * np.pi * freq * (1 + detune) * mult * t + 0.3)
    return out / sum(a for _, a in harmonics)


# Chord voicings (MIDI): Am7, Fmaj7, Cmaj7, G6
CHORDS = [
    [57, 60, 64, 67],
    [53, 57, 60, 64],
    [48, 52, 55, 59],
    [55, 59, 62, 64],
]
BASS = [45, 41, 36, 43]

for bar in range(BARS):
    chord = CHORDS[bar % 4]
    bass = BASS[bar % 4]
    start = bar * BAR

    # Pad: slow attack, detuned, low-passed.
    pad = np.zeros(int(BAR * SR * 1.05))
    for note in chord:
        pad += tone(midi(note), BAR * 1.05, detune=0.004)
    pad = lowpass(pad / len(chord), 900) * env(pad.size, 0.6, 2.0, 0.7, 0.4)
    add(pad, start, pan=0.0, gain=0.22)

    # Bass: round pluck on beats 1 and 3, octave pickup on the "and" of 4.
    for beat, note in ((0, bass), (2, bass), (3.5, bass + 12)):
        n = int(BEAT * 0.9 * SR)
        sig = tone(midi(note), BEAT * 0.9, harmonics=((1, 1.0), (2, 0.2))) * env(n, 0.01, 0.35)
        add(lowpass(sig, 400), start + beat * BEAT, gain=0.5)

    # Arpeggio: plucked 8ths with swing, alternating pan.
    pattern = [0, 2, 1, 3, 2, 0, 3, 1]
    for step in range(8):
        swing = 0.08 * BEAT if step % 2 else 0.0
        t = start + step * BEAT / 2 + swing
        note = chord[pattern[(step + bar) % 8]] + 12
        n = int(BEAT * 0.6 * SR)
        sig = tone(midi(note), BEAT * 0.6, harmonics=((1, 1.0), (2, 0.5), (4, 0.15))) * env(n, 0.004, 0.18)
        if rng.random() < 0.85:
            add(sig, t, pan=0.5 if step % 2 else -0.5, gain=0.16 * (0.8 + 0.4 * rng.random()))

    # Drums
    for beat in (0, 2):
        n = int(0.3 * SR)
        tt = np.arange(n) / SR
        kick = np.sin(2 * np.pi * (40 + 90 * np.exp(-tt * 28)) * tt) * np.exp(-tt * 9)
        add(kick, start + beat * BEAT, gain=0.55)
    for beat in (1, 3):
        n = int(0.18 * SR)
        tt = np.arange(n) / SR
        snare = (rng.normal(0, 1, n) * np.exp(-tt * 22) * 0.6 + np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 30) * 0.5)
        add(lowpass(snare, 5000), start + beat * BEAT, gain=0.28)
    for step in range(8):
        swing = 0.08 * BEAT if step % 2 else 0.0
        n = int(0.05 * SR)
        tt = np.arange(n) / SR
        hat = rng.normal(0, 1, n) * np.exp(-tt * 90)
        hat = hat - lowpass(hat, 6000)
        add(hat, start + step * BEAT / 2 + swing, pan=0.25, gain=0.10 * (1.0 if step % 2 == 0 else 0.6))

# Gentle fade in/out and normalisation.
fade = int(2.0 * SR)
mix[:fade] *= np.linspace(0, 1, fade)[:, None]
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix = np.tanh(mix * 1.4)
mix *= 0.6 / np.max(np.abs(mix))

import soundfile as sf

wav = OUT / "bed.wav"
sf.write(wav, mix.astype(np.float32), SR)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-q:a", "3", str(OUT / "bed.mp3")], check=True)
wav.unlink()
print("wrote", OUT / "bed.mp3", f"{LENGTH / SR:.1f}s")
