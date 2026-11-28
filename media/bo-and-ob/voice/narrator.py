"""Series narrator: Chatterbox built-in voice, "tense" take (chosen 2026-11-17).

Usage:  python narrator.py lines.txt out_dir
lines.txt holds one line per row as:  exaggeration|pause_after_seconds|text
(exaggeration 0.60 for plain narration, up to 0.75 on the key line of a passage).
Write breaks into the text itself ("his reflection... was late.").

Then deepen each clip with ffmpeg:
  -af "asetrate=24000*0.91,aresample=44100,atempo=1.05,bass=g=3:f=120"

Needs:  pip install chatterbox-tts "setuptools<81"   and   HF_HUB_DISABLE_XET=1
"""
import os, sys
import torch, torchaudio
from chatterbox.tts import ChatterboxTTS

CFG_WEIGHT, TEMPERATURE, SEED = 0.25, 0.8, 23

def main(lines_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    model = ChatterboxTTS.from_pretrained(device="cpu")
    torch.manual_seed(SEED)
    for i, row in enumerate(l for l in open(lines_path, encoding="utf-8").read().splitlines() if l.strip()):
        ex, gap, text = row.split("|", 2)
        wav = model.generate(text, exaggeration=float(ex), cfg_weight=CFG_WEIGHT, temperature=TEMPERATURE)
        wav = torch.cat([wav, torch.zeros(1, int(model.sr * float(gap)))], dim=1)
        torchaudio.save(os.path.join(out_dir, f"{i:03d}.wav"), wav, model.sr)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
