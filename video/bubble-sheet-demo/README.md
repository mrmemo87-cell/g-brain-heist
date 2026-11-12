# Bubble sheet demo video

An animated explainer (about 90 seconds, 1920x1080, 30 fps) showing the Brains Heist paper
assignment flow: build the assignment, print QR bubble sheets, students fill them in, the
teacher photographs them with a phone, uncertain marks are reviewed, results land in the
gradebook.

Everything in the pipeline is free and runs offline once the voice model is downloaded.

## Layout

| Path | What it is |
|------|------------|
| `script/narration.json` | The voiceover script, one entry per scene. Edit the wording here. |
| `scripts/voiceover.py` | Synthesises the narration with Kokoro and writes `public/vo/*.mp3` plus `manifest.json` (per-scene durations). Also generates the click, shutter, chime and paper sound effects into `public/sfx/`. |
| `scripts/generate-sheet.ts` | Renders `public/sheet.svg` with the app's real `buildBubbleSheetSvg`, so the sheet in the video is the one teachers actually print. |
| `src/timing.ts` | Turns the manifest into scene durations. Each scene is its narration plus a short lead-in and tail. |
| `src/scenes/*.tsx` | One component per scene. Visual beats are placed with `beat(scene, secondsIntoNarration)`. |
| `src/components/` | Stick figures, callouts, cursor, the sheet with bubble overlays, the mock app window, captions. |
| `public/` | Generated assets: sheet, voice, sound effects, fonts (IBM Plex Sans, OFL), logo. |

## Regenerate from scratch

```bash
# 1. Install (from this folder)
npm install

# 2. Rebuild the sheet from the app's print code (from the repository root)
npm run sheet

# 3. Voiceover: download the Kokoro model once (about 350 MB) from the kokoro-onnx GitHub releases
#    https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile
KOKORO_MODEL=/path/kokoro-v1.0.onnx KOKORO_VOICES=/path/voices-v1.0.bin .venv/bin/python scripts/voiceover.py

# 4. Preview in the Remotion Studio, or render
npm run preview
npm run render          # out/bubble-sheet-demo.mp4
```

If Remotion cannot download its own Chrome, point it at an installed one:
`REMOTION_BROWSER=/path/to/chrome npm run render`.

## Changing the narration

Edit `script/narration.json`, rerun `scripts/voiceover.py`, then render. Scene lengths follow
the new audio automatically. Beats inside a scene are in seconds from the start of that
scene's narration, so if a sentence gets much longer or shorter, nudge the `b(...)` values in
that scene.

## Swapping in real screen recordings

The mock app windows (`AppFrame`) are placeholders for real footage. To replace one, record the
real teacher flow (for example with Playwright's video recording), drop the file in `public/`,
and render it with Remotion's `<OffthreadVideo>` inside the scene in place of the `AppFrame`.

## Licensing notes

- Remotion is free for individuals and companies with up to three people. Larger companies need
  a company licence: https://www.remotion.dev/license
- Kokoro voices are Apache 2.0. IBM Plex Sans is under the SIL Open Font License.
- No stock music is bundled. Add a track from the YouTube Audio Library as `public/music.mp3`
  and an `<Audio>` in `src/Video.tsx` if you want a bed.
