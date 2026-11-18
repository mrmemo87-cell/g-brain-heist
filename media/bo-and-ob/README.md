# Bo & Ob

Source for the "Bo & Ob" animated mystery series ("What if…"). It is unrelated to the
Brains Heist app and is kept here only so the characters, voices and sounds can be reused.

## Layout

- `ep1/` — Episode 1, "What if your reflection stopped copying you?"
  - `scene.html` — the whole animation (characters, rooms, camera), drawn as SVG by `renderAt(t)`.
  - `build.mjs` — builds the timing sheet (`data.js`) from the voice clips and mixes the soundtrack (`mix.wav`).
  - `render.mjs` — renders frames with Playwright (`node render.mjs frames 6`) or test stills (`node render.mjs stills 1,5,9`).
  - `short/make.mjs` — cuts the vertical YouTube Short from the rendered frames.
  - `thumb.mjs` — composes the thumbnail.
  - `voice/` — narrator, Bo and Ob voice clips (Ob is Bo's voice, lowered and echoed by `build.mjs`).
- `sfx/` — reusable realistic sound effects and the two ambience loops. No music is used.

## Rebuild Episode 1

Needs Node, Playwright with Chromium, and ffmpeg. Run inside `ep1/`:

```
node build.mjs
node render.mjs frames 6
ffmpeg -framerate 30 -i frames/%05d.jpg -i mix.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -shortest ep1.mp4
node short/make.mjs
```

The font in `ep1/fonts` is Fredoka (SIL Open Font License).

## Episode 2

`ep2/` — "What If You Couldn't Get Back Out?" Same workflow as Episode 1, with one extra step:
`node gen.mjs` builds `scene.html` from Episode 1's character library plus `tail.js` (this
episode's scenes). The narrator is the free Chatterbox voice (`voice/narrator.py`, lines in
`ep2/narr.txt`, raw takes in `ep2/narr_raw/`); Bo and Ob are in `ep2/voice/`.

## Episode 3

`ep3/` — "What If You Woke Up in the Wrong Life?" Same workflow as Episode 2 (`node gen.mjs`,
`node build.mjs`, `node render.mjs frames 6`). New in the character library here: the mother, the
girl (Yasmine), the cat, and writing on fogged glass. `narr_fix.txt` holds the three narrator lines
re-recorded after the girl was renamed; they replace takes 003, 007 and 021 in `narr_raw/`.

## Episode 4 onward

From Episode 4 each episode folder holds `episode.mjs` (voice batches, the timeline, sound cues and the
Short's captions) and `tail.js` (its scenes). Build with the shared tools:

```
node gen.mjs                    # assemble scene.html
node ../tools/build.mjs         # voices, timeline (data.js) and soundtrack (mix.wav)
node render.mjs frames 6        # frames/
node ../tools/short.mjs         # short.mp4
node thumb.mjs                  # thumb_raw.png
```

`tools/split.mjs` checks where a batched voice recording should be cut; `tools/save-episode.sh` copies a
working episode folder into the repo.
