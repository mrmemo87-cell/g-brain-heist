# Paper assignment demo videos

Two explainer videos of the Brains Heist paper flow, cut from recordings of the real app:
build the assignment, print QR bubble sheets, photograph the filled sheets, review the one
flagged mark, confirm, and open the report.

| Composition | Output | Footage |
|-------------|--------|---------|
| `DesktopDemo` (1920x1080) | `out/brains-heist-paper-desktop.mp4` | laptop recording |
| `MobileDemo` (1080x1920) | `out/brains-heist-paper-mobile.mp4` | phone recording at 3x |

Everything in the pipeline is free: Playwright drives the app, Chrome's screencast captures
the phone, Kokoro speaks the narration offline, the music bed and sound effects are
synthesised, Remotion animates, ffmpeg encodes.

## Layout

| Path | What it is |
|------|------------|
| `capture/record.mjs` | Drives the whole teacher flow against the demo project and logs every click with a timestamp and position. Issues real sheets, turns them into desk photos with the correct answers (plus one deliberate double mark), and scans them with the app's own OMR. `node capture/record.mjs desktop|mobile` |
| `capture/prepare.mjs` | Converts a recording into `public/footage/<mode>/`: H.264 MP4s, the first issued sheets, the photos, and `timeline.json` (click marks in video pixels). |
| `script/narration.json` | The voiceover script, one entry per scene. |
| `scripts/voiceover.py` | Kokoro narration into `public/vo/`, plus synthesised sound effects into `public/sfx/`. |
| `scripts/music.py` | Synthesised lo-fi bed into `public/music/bed.mp3`. |
| `src/timing.ts` | Scene durations from the narration manifest, with the transition overlap. |
| `src/plan.ts` | Maps click marks to footage clips and camera keyframes (zoom to the control in use). |
| `src/scenes/*.tsx` | One component per scene; each works in both orientations through `src/layout.ts`. |
| `src/components/Footage.tsx` | A slice of a recording with smooth camera moves. `Clips.tsx` chains slices with whip transitions. |

The MP4 footage is not committed (see `.gitignore`); regenerate it with the capture scripts.

## Regenerate

```bash
npm install

# App running locally against the demo Supabase project (see .env.local in the repo root)
#   VITE_SUPABASE_URL=https://lvkmkgjpcbdyzdkbqcgc.supabase.co  + its anon key
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4180   # from the repo root

# Record (needs Playwright + Chromium; set PLAYWRIGHT_MODULE_PATH / CHROMIUM_EXECUTABLE_PATH if they are not resolvable)
node capture/record.mjs desktop && node capture/prepare.mjs desktop
node capture/record.mjs mobile  && node capture/prepare.mjs mobile

# Voice and music (Kokoro model files from the kokoro-onnx GitHub releases, model-files-v1.0)
python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile
KOKORO_MODEL=/path/kokoro-v1.0.onnx KOKORO_VOICES=/path/voices-v1.0.bin .venv/bin/python scripts/voiceover.py
.venv/bin/python scripts/music.py

# Preview or render
npm run preview
npm run render:desktop
npm run render:mobile
```

If Remotion cannot download its own Chrome, point it at an installed one with `REMOTION_BROWSER`.

## Changing the narration

Edit `script/narration.json`, rerun `scripts/voiceover.py`, render. Scene lengths follow the
audio. Visual beats inside a scene are `b(seconds)` from the start of that scene's narration,
so nudge them if a sentence changes length a lot.

## Notes

- The recorder logs in as the public demo teacher (`demo.teacher@example.com`) on the demo
  project, which resets nightly. Each take creates a fresh assignment and scan session there.
- The photos are rendered from the issued sheet SVGs with pencil marks, mild perspective and a
  desk background; the app's scanner reads them exactly as it would a phone photo.
- Remotion is free for individuals and companies with up to three people; larger companies
  need a company licence. Kokoro voices are Apache 2.0, IBM Plex Sans is OFL.
