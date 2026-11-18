#!/usr/bin/env bash
# Copies an episode's source from a working folder into the repo (no frames, videos or generated wavs).
# Usage: tools/save-episode.sh <working episode folder> <episode folder name, e.g. ep4>
set -euo pipefail
SRC="$1"; DST="$(cd "$(dirname "$0")/.." && pwd)/$2"
mkdir -p "$DST/voice" "$DST/narr_raw"
for f in scene.html tail.js gen.mjs episode.mjs render.mjs data.js narr.txt narr_fix.txt thumb.mjs thumbnail.jpg; do [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DST/"; done
cp -r "$SRC/fonts" "$DST/"
cp "$SRC"/voice/*.mp3 "$DST/voice/"
for f in "$SRC"/narr_raw/*.wav; do ffmpeg -y -v error -i "$f" -b:a 192k "$DST/narr_raw/$(basename "${f%.wav}").mp3"; done
echo "saved $2: $(ls "$DST/narr_raw" | wc -l) narrator takes, $(ls "$DST/voice" | wc -l) voice batches"
