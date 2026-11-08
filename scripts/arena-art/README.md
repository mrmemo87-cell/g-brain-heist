# Arena fighter animations

`fighters.py` builds the four Proving Grounds fighters in Blender, rigs them with pivot joints,
keys four loops (idle 12 frames, run 12, attack 8, ko 10) and renders each loop as a horizontal
strip: Cycles on the CPU, 16 samples with denoising, Freestyle outlines, transparent background,
orthographic camera tilted 35 degrees. Fighters face right; the game mirrors them.

Needs Blender 4.2. Either run it inside Blender, or use the `bpy` package from PyPI with Python 3.11:

```bash
python3.11 -m venv blenv && blenv/bin/pip install bpy==4.2.0 pillow
blenv/bin/python scripts/arena-art/fighters.py /tmp/arena-out rivet fizz vex boulder
python3 scripts/arena-art/to_webp.py /tmp/arena-out public/arena/anim rivet fizz vex boulder
```

`to_webp.py` scales frames to 192 px and writes `public/arena/anim/<fighter>_<anim>.webp`, which
`loadArenaAnims` in `src/features/arena/arenaEngine.ts` loads when a match starts. If a strip is
missing, the engine falls back to the still sprite in `public/arena`.
