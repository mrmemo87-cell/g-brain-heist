# Arena fighter animations

`fighters.py` builds the four Proving Grounds fighters in Blender, rigs them with pivot joints and
renders four loops (idle 8 frames, run 10, attack 6, ko 10) from eight directions: Cycles on the
CPU, 16 samples with denoising, Freestyle outlines, transparent background, orthographic camera
tilted 35 degrees. Each loop becomes one sheet with a row per direction (right, then clockwise in
45-degree steps) and a column per frame, 160 px per frame. The game turns fighters through these
directions instead of mirroring them. All four fighters take about half an hour on four CPU cores.

Needs Blender 4.2. Either run it inside Blender, or use the `bpy` package from PyPI with Python 3.11:

```bash
python3.11 -m venv blenv && blenv/bin/pip install bpy==4.2.0 pillow
blenv/bin/python scripts/arena-art/fighters.py /tmp/arena-out rivet fizz vex boulder
python3 scripts/arena-art/to_webp.py /tmp/arena-out public/arena/anim rivet fizz vex boulder
```

`to_webp.py` writes `public/arena/anim/<fighter>_<anim>.webp`, which
`loadArenaAnims` in `src/features/arena/arenaEngine.ts` loads when a match starts. If a strip is
missing, the engine falls back to the still sprite in `public/arena`.
