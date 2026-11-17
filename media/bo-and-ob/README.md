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
